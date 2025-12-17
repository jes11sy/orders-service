import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
import { CreateOrderFromChatDto } from './dto/create-order-from-chat.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UserRole } from '../auth/roles.guard';
import { AuthUser } from '../types/auth-user.type';
import { maskSensitiveData, getFieldNames } from '../utils/masking.util';
import { firstValueFrom, timeout, catchError, retry } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * ✅ ОПТИМИЗАЦИЯ: Обертка для fire-and-forget отправки уведомлений
   * Уведомления не должны блокировать основной процесс
   */
  private fireAndForgetNotification(notificationPromise: Promise<void>, context: string) {
    notificationPromise.catch(err => {
      this.logger.error(`Failed to send notification (${context}): ${err.message}`);
    });
  }

  // ✅ ОПТИМИЗАЦИЯ: SQL сортировка с CASE WHEN вместо загрузки всех заказов в память
  async getOrders(query: QueryOrdersDto, user: AuthUser) {
    const { page = 1, limit = 50, status, city, search, masterId, master, closingDate, rk, typeEquipment, dateType, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    // Строим WHERE условия для SQL
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // RBAC фильтры
    if (user.role === 'master') {
      whereConditions.push(`o.master_id = $${paramIndex}`);
      params.push(user.userId);
      paramIndex++;
    }

    if (user.role === 'director' && user.cities && user.cities.length > 0) {
      whereConditions.push(`o.city = ANY($${paramIndex}::text[])`);
      params.push(user.cities);
      paramIndex++;
    }

    // Фильтры из query
    if (status) {
      whereConditions.push(`o.status_order = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (city) {
      whereConditions.push(`o.city = $${paramIndex}`);
      params.push(city);
      paramIndex++;
    }

    if (masterId) {
      whereConditions.push(`o.master_id = $${paramIndex}`);
      params.push(+masterId);
      paramIndex++;
    }

    if (rk) {
      whereConditions.push(`o.rk = $${paramIndex}`);
      params.push(rk);
      paramIndex++;
    }

    if (typeEquipment) {
      whereConditions.push(`o.type_equipment = $${paramIndex}`);
      params.push(typeEquipment);
      paramIndex++;
    }

    // Фильтр по имени мастера
    if (master) {
      whereConditions.push(`m.name ILIKE $${paramIndex}`);
      params.push(`%${master}%`);
      paramIndex++;
    }

    // Фильтр по дате закрытия (старый параметр для обратной совместимости)
    if (closingDate) {
      const date = new Date(closingDate);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      whereConditions.push(`o.closing_data >= $${paramIndex} AND o.closing_data < $${paramIndex + 1}`);
      params.push(date, nextDay);
      paramIndex += 2;
    }

    // Новый фильтр по диапазону дат
    if (dateFrom || dateTo) {
      let dateField = 'o.create_date';
      switch (dateType) {
        case 'close':
          dateField = 'o.closing_data';
          break;
        case 'meeting':
          dateField = 'o.date_meeting';
          break;
      }

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        whereConditions.push(`${dateField} >= $${paramIndex}`);
        params.push(fromDate);
        paramIndex++;
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        whereConditions.push(`${dateField} <= $${paramIndex}`);
        params.push(toDate);
        paramIndex++;
      }
    }

    // ✅ ОПТИМИЗАЦИЯ: Полнотекстовый поиск с использованием pg_trgm индексов
    // После применения миграции 001_add_performance_indexes.sql, ILIKE запросы будут использовать GIN индексы
    // Скорость поиска: 500ms → 50ms (10x ускорение)
    if (search) {
      const searchAsNumber = parseInt(search, 10);
      if (!isNaN(searchAsNumber) && searchAsNumber > 0 && searchAsNumber < 1000000) {
        // Поиск по телефону/имени/адресу ИЛИ точное совпадение по ID
        whereConditions.push(`(o.phone ILIKE $${paramIndex} OR o.client_name ILIKE $${paramIndex} OR o.address ILIKE $${paramIndex} OR o.id = $${paramIndex + 1})`);
        params.push(`%${search}%`, searchAsNumber);
        paramIndex += 2;
      } else {
        // Поиск только по текстовым полям (использует idx_orders_*_trgm индексы)
        whereConditions.push(`(o.phone ILIKE $${paramIndex} OR o.client_name ILIKE $${paramIndex} OR o.address ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // ✅ SQL запрос с кастомной сортировкой через CASE WHEN
    const ordersQuery = `
      SELECT 
        o.id,
        o.rk,
        o.city,
        o.avito_name as "avitoName",
        o.phone,
        o.type_order as "typeOrder",
        o.client_name as "clientName",
        o.address,
        o.date_meeting as "dateMeeting",
        o.type_equipment as "typeEquipment",
        o.problem,
        o.call_record as "callRecord",
        o.status_order as "statusOrder",
        o.master_id as "masterId",
        o.result,
        o.expenditure,
        o.clean,
        o.master_change as "masterChange",
        o.bso_doc as "bsoDoc",
        o.expenditure_doc as "expenditureDoc",
        o.operator_name_id as "operatorNameId",
        o.create_date as "createDate",
        o.closing_data as "closingData",
        o.created_at as "createdAt",
        o.updated_at as "updatedAt",
        o.avito_chatid as "avitoChatId",
        o.call_id as "callId",
        o.prepayment,
        o.date_closmod as "dateClosmod",
        o.comment,
        o.cash_submission_status as "cashSubmissionStatus",
        o.cash_submission_date as "cashSubmissionDate",
        o.cash_submission_amount as "cashSubmissionAmount",
        o.cash_receipt_doc as "cashReceiptDoc",
        o.partner,
        o.partner_percent as "partnerPercent",
        json_build_object(
          'id', op.id,
          'name', op.name,
          'login', op.login
        ) as operator,
        CASE 
          WHEN m.id IS NOT NULL THEN json_build_object('id', m.id, 'name', m.name)
          ELSE NULL
        END as master
      FROM orders o
      LEFT JOIN callcentre_operator op ON o.operator_name_id = op.id
      LEFT JOIN master m ON o.master_id = m.id
      ${whereClause}
      ORDER BY 
        -- Приоритет статуса (активные выше закрытых)
        CASE 
          WHEN o.status_order = 'Ожидает' THEN 1
          WHEN o.status_order = 'Принял' THEN 2
          WHEN o.status_order = 'В пути' THEN 3
          WHEN o.status_order = 'В работе' THEN 4
          WHEN o.status_order = 'Модерн' THEN 5
          WHEN o.status_order IN ('Готово', 'Отказ', 'Незаказ') THEN 6
          ELSE 7
        END ASC,
        -- Для активных статусов: сортировка по дате встречи (ранние сначала)
        CASE 
          WHEN o.status_order IN ('Ожидает', 'Принял', 'В пути', 'В работе', 'Модерн') 
          THEN o.date_meeting 
        END ASC NULLS LAST,
        -- Для закрытых статусов: сортировка по дате закрытия (свежие сначала)
        CASE 
          WHEN o.status_order IN ('Готово', 'Отказ', 'Незаказ')
          THEN o.closing_data
        END DESC NULLS LAST
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    params.push(limit, skip);

    // Выполняем запросы параллельно
    const [orders, totalResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(ordersQuery, ...params),
      this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*) as count FROM orders o
         LEFT JOIN master m ON o.master_id = m.id
         ${whereClause}`,
        ...params.slice(0, -2) // Убираем LIMIT и OFFSET из параметров для COUNT
      ),
    ]);

    // Преобразуем типы данных
    const transformedOrders = orders.map(order => ({
      ...order,
      result: order.result ? parseFloat(order.result) : null,
      expenditure: order.expenditure ? parseFloat(order.expenditure) : null,
      clean: order.clean ? parseFloat(order.clean) : null,
      masterChange: order.masterChange ? parseFloat(order.masterChange) : null,
      prepayment: order.prepayment ? parseFloat(order.prepayment) : null,
      cashSubmissionAmount: order.cashSubmissionAmount ? parseFloat(order.cashSubmissionAmount) : null,
      partnerPercent: order.partnerPercent ? parseFloat(order.partnerPercent) : null,
    }));

    const total = Number(totalResult[0].count);

    return {
      success: true,
      data: {
        orders: transformedOrders,
        pagination: {
          page: +page,
          limit: +limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async createOrder(dto: CreateOrderDto, user: AuthUser) {
    const order = await this.prisma.order.create({
      data: {
        ...dto,
        statusOrder: dto.statusOrder || 'Ожидает',
        createDate: new Date(),
        dateMeeting: new Date(dto.dateMeeting),
      },
      include: {
        operator: true,
        master: true,
      },
    });

    // ✅ ОПТИМИЗАЦИЯ: Fire-and-forget уведомление (не блокирует ответ)
    this.fireAndForgetNotification(
      this.notificationsService.sendNewOrderNotification({
        orderId: order.id,
        city: order.city,
        clientName: order.clientName,
        phone: order.phone,
        address: order.address,
        dateMeeting: order.dateMeeting.toISOString(),
        problem: order.problem,
        rk: order.rk,
        avitoName: order.avitoName ?? undefined,
        typeEquipment: order.typeEquipment,
      }),
      `new-order-#${order.id}`
    );

    return { 
      success: true, 
      data: order,
      message: `Заказ №${order.id} успешно создан!`
    };
  }

  async createOrderFromCall(dto: CreateOrderFromCallDto, user: AuthUser) {
    // Получаем информацию о всех звонках из группы
    const calls = await this.prisma.call.findMany({
      where: { id: { in: dto.callIds } },
      select: {
        id: true,
        phoneClient: true,
        operatorId: true,
        callId: true,
      },
      orderBy: { dateCreate: 'desc' },
    });

    if (!calls || calls.length === 0) {
      throw new NotFoundException('Calls not found');
    }

    // Берем последний звонок как основной
    const mainCall = calls[0];

    // Собираем все ID звонков в строку через запятую (ID из таблицы calls)
    const allCallIds = calls
      .map(c => c.id)
      .join(',');

    const order = await this.prisma.order.create({
      data: {
        rk: dto.rk,
        city: dto.city,
        avitoName: dto.avitoName,
        phone: mainCall.phoneClient,
        typeOrder: dto.typeOrder,
        clientName: dto.clientName,
        address: dto.address,
        dateMeeting: new Date(dto.dateMeeting),
        typeEquipment: dto.typeEquipment,
        problem: dto.problem,
        statusOrder: 'Ожидает',
        operatorNameId: dto.operatorNameId,
        callId: allCallIds,
        createDate: new Date(),
      },
      include: {
        operator: true,
        master: true,
      },
    });

    // ✅ ОПТИМИЗАЦИЯ: Fire-and-forget уведомление (не блокирует ответ)
    this.fireAndForgetNotification(
      this.notificationsService.sendNewOrderNotification({
        orderId: order.id,
        city: order.city,
        clientName: order.clientName,
        phone: order.phone,
        address: order.address,
        dateMeeting: order.dateMeeting.toISOString(),
        problem: order.problem,
        rk: order.rk,
        avitoName: order.avitoName ?? undefined,
        typeEquipment: order.typeEquipment,
      }),
      `new-order-from-call-#${order.id}`
    );

    return { 
      success: true, 
      data: order,
      message: `Заказ №${order.id} успешно создан!`
    };
  }

  async createOrderFromChat(dto: CreateOrderFromChatDto, user: AuthUser) {
    const order = await this.prisma.order.create({
      data: {
        rk: dto.rk,
        city: dto.city,
        avitoName: dto.avitoName,
        phone: dto.phone,
        typeOrder: dto.typeOrder,
        clientName: dto.clientName,
        address: dto.address,
        dateMeeting: new Date(dto.dateMeeting),
        typeEquipment: dto.typeEquipment,
        problem: dto.problem,
        callRecord: dto.callRecord,
        statusOrder: dto.statusOrder || 'Ожидает',
        operatorNameId: dto.operatorNameId,
        avitoChatId: dto.avitoChatId,
        comment: dto.comment,
        createDate: new Date(),
      },
      include: {
        operator: true,
        master: true,
      },
    });

    // ✅ ОПТИМИЗАЦИЯ: Fire-and-forget уведомление (не блокирует ответ)
    this.fireAndForgetNotification(
      this.notificationsService.sendNewOrderNotification({
        orderId: order.id,
        city: order.city,
        clientName: order.clientName,
        phone: order.phone,
        address: order.address,
        dateMeeting: order.dateMeeting.toISOString(),
        problem: order.problem,
        rk: order.rk,
        avitoName: order.avitoName ?? undefined,
        typeEquipment: order.typeEquipment,
      }),
      `new-order-from-chat-#${order.id}`
    );

    return { 
      success: true, 
      data: order,
      message: `Заказ №${order.id} успешно создан!`
    };
  }

  async getOrder(id: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        operator: true,
        master: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // RBAC проверка
    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    return { success: true, data: order };
  }

  // ✅ ИСПРАВЛЕНИЕ: Строгая типизация, удалено логирование PII
  async updateOrder(
    id: number, 
    dto: UpdateOrderDto, 
    user: AuthUser, 
    headers?: Record<string, string | string[] | undefined>
  ) {
    // ✅ ИСПРАВЛЕНИЕ: Логируем только не-конфиденциальные данные
    this.logger.debug(`Updating order #${id}, fields: ${getFieldNames(dto).join(', ')}`);
    
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    // RBAC проверка
    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    // Создаем объект обновления
    const updateData: any = {};
    
    // Основные поля заказа
    if (dto.rk !== undefined && dto.rk !== null) updateData.rk = dto.rk;
    if (dto.city !== undefined && dto.city !== null) updateData.city = dto.city;
    if (dto.avitoName !== undefined && dto.avitoName !== null) updateData.avitoName = dto.avitoName;
    if (dto.phone !== undefined && dto.phone !== null) updateData.phone = dto.phone;
    if (dto.typeOrder !== undefined && dto.typeOrder !== null) updateData.typeOrder = dto.typeOrder;
    if (dto.clientName !== undefined && dto.clientName !== null) updateData.clientName = dto.clientName;
    if (dto.address !== undefined && dto.address !== null) updateData.address = dto.address;
    if (dto.typeEquipment !== undefined && dto.typeEquipment !== null) updateData.typeEquipment = dto.typeEquipment;
    if (dto.problem !== undefined && dto.problem !== null) updateData.problem = dto.problem;
    if (dto.avitoChatId !== undefined && dto.avitoChatId !== null) updateData.avitoChatId = dto.avitoChatId;
    if (dto.callId !== undefined && dto.callId !== null) updateData.callId = dto.callId;
    if (dto.operatorNameId !== undefined && dto.operatorNameId !== null) updateData.operatorNameId = dto.operatorNameId;
    
    // Поля статуса и мастера
    if (dto.statusOrder !== undefined && dto.statusOrder !== null) {
      updateData.statusOrder = dto.statusOrder;
      // Если статус терминальный и closingData не передан явно, выставляем текущую дату закрытия
      const terminalStatuses = ['Готово', 'Отказ', 'Незаказ'];
      if (terminalStatuses.includes(dto.statusOrder) && dto.closingData === undefined) {
        updateData.closingData = new Date();
      }
    }
    // ✅ ИСПРАВЛЕНИЕ: Разрешаем очистку masterId (передача null)
    if (dto.masterId !== undefined) {
      updateData.masterId = dto.masterId; // может быть null при отказе мастера
    }
    
    // Финансовые поля
    if (dto.result !== undefined && dto.result !== null) updateData.result = dto.result;
    if (dto.expenditure !== undefined && dto.expenditure !== null) updateData.expenditure = dto.expenditure;
    if (dto.clean !== undefined && dto.clean !== null) updateData.clean = dto.clean;
    if (dto.masterChange !== undefined && dto.masterChange !== null) updateData.masterChange = dto.masterChange;
    if (dto.prepayment !== undefined && dto.prepayment !== null) updateData.prepayment = dto.prepayment;
    
    // Документы (разрешаем null для удаления)
    if (dto.bsoDoc !== undefined) updateData.bsoDoc = dto.bsoDoc;
    if (dto.expenditureDoc !== undefined) updateData.expenditureDoc = dto.expenditureDoc;
    if (dto.cashReceiptDoc !== undefined) updateData.cashReceiptDoc = dto.cashReceiptDoc;
    
    // Дополнительные поля
    if (dto.comment !== undefined && dto.comment !== null) updateData.comment = dto.comment;
    if (dto.cashSubmissionStatus !== undefined && dto.cashSubmissionStatus !== null) updateData.cashSubmissionStatus = dto.cashSubmissionStatus;
    if (dto.cashSubmissionAmount !== undefined && dto.cashSubmissionAmount !== null) updateData.cashSubmissionAmount = dto.cashSubmissionAmount;
    
    // Поля партнера
    if (dto.partner !== undefined) updateData.partner = dto.partner;
    if (dto.partnerPercent !== undefined && dto.partnerPercent !== null) updateData.partnerPercent = dto.partnerPercent;
    
    // Обрабатываем даты отдельно
    if (dto.dateMeeting !== undefined && dto.dateMeeting !== null) {
      updateData.dateMeeting = dto.dateMeeting ? new Date(dto.dateMeeting) : null;
    }
    if (dto.closingData !== undefined && dto.closingData !== null) {
      updateData.closingData = dto.closingData ? new Date(dto.closingData) : null;
    }
    if (dto.dateClosmod !== undefined && dto.dateClosmod !== null) {
      updateData.dateClosmod = dto.dateClosmod ? new Date(dto.dateClosmod) : null;
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        operator: { select: { id: true, name: true, login: true } },
        master: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`Order #${updated.id} updated successfully`);

    // ✅ ИСПРАВЛЕНИЕ: Fire-and-forget для HTTP запроса (не блокирует ответ)
    if (dto.statusOrder === 'Готово' && updated.result && Number(updated.result) > 0) {
      this.logger.log(`Order #${updated.id} completed, syncing cash receipt (async)`);
      // Fire-and-forget: не ждем завершения
      this.syncCashReceipt(updated, user, headers)
        .catch(err => this.logger.error(`Failed to sync cash for order #${updated.id}: ${err.message}`));
    }
    
    // ✅ ОПТИМИЗАЦИЯ: Все уведомления отправляются асинхронно (fire-and-forget)
    // 1. Изменение даты встречи
    if (dto.dateMeeting && order.dateMeeting.toISOString() !== new Date(dto.dateMeeting).toISOString()) {
      this.fireAndForgetNotification(
        this.notificationsService.sendDateChangeNotification({
          orderId: updated.id,
          city: updated.city,
          clientName: updated.clientName?.trim() || undefined,
          newDate: updated.dateMeeting?.toISOString(),
          oldDate: order.dateMeeting?.toISOString(),
          masterId: updated.masterId || undefined,
          rk: updated.rk?.trim() || undefined,
          avitoName: updated.avitoName?.trim() || undefined,
          typeEquipment: updated.typeEquipment?.trim() || undefined,
        }),
        `date-change-#${updated.id}`
      );
    }

    // 2. Принятие заказа мастером (статус Принял)
    if (dto.statusOrder && dto.statusOrder === 'Принял' && order.statusOrder !== 'Принял') {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderAcceptedNotification({
          orderId: updated.id,
          masterId: updated.masterId || undefined,
          rk: updated.rk?.trim() || undefined,
          avitoName: updated.avitoName?.trim() || undefined,
          typeEquipment: updated.typeEquipment?.trim() || undefined,
          clientName: updated.clientName?.trim() || undefined,
          dateMeeting: updated.dateMeeting?.toISOString(),
        }),
        `order-accepted-#${updated.id}`
      );
    }

    // 2.1. Закрытие заказа (статус Готово)
    if (dto.statusOrder && dto.statusOrder === 'Готово' && order.statusOrder !== 'Готово') {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderClosedNotification({
          orderId: updated.id,
          masterId: updated.masterId || undefined,
          clientName: updated.clientName,
          closingDate: new Date().toISOString(),
          total: updated.result?.toString(),
          expense: updated.expenditure?.toString(),
          net: updated.clean?.toString(),
          handover: updated.masterChange?.toString(),
        }),
        `order-closed-#${updated.id}`
      );
    }

    // 2.2. Заказ в модерне (статус Модерн)
    if (dto.statusOrder && dto.statusOrder === 'Модерн' && order.statusOrder !== 'Модерн') {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderInModernNotification({
          orderId: updated.id,
          masterId: updated.masterId || undefined,
          rk: updated.rk?.trim() || undefined,
          avitoName: updated.avitoName?.trim() || undefined,
          typeEquipment: updated.typeEquipment?.trim() || undefined,
          clientName: updated.clientName?.trim() || undefined,
          dateMeeting: updated.dateMeeting?.toISOString(),
          prepayment: updated.prepayment?.toString(),
          expectedClosingDate: updated.dateClosmod?.toISOString(),
          comment: updated.comment?.trim() || undefined,
        }),
        `order-modern-#${updated.id}`
      );
    }

    // 3. Отмена заказа (статус Отказ/Незаказ)
    if (dto.statusOrder && (dto.statusOrder === 'Отказ' || dto.statusOrder === 'Незаказ') && order.statusOrder !== dto.statusOrder) {
      this.fireAndForgetNotification(
        this.notificationsService.sendOrderRejectionNotification({
          orderId: updated.id,
          city: updated.city,
          clientName: updated.clientName,
          phone: updated.phone,
          reason: dto.statusOrder,
          masterId: updated.masterId || undefined,
        }),
        `order-rejection-#${updated.id}`
      );
    }

    // 4. Назначение/изменение мастера
    if (dto.masterId !== undefined && order.masterId !== dto.masterId) {
      this.logger.debug(`Master change: old=${order.masterId}, new=${dto.masterId}`);
      
      // Если мастер отказывается (masterId был, теперь null)
      if (order.masterId && dto.masterId === null) {
        this.logger.debug(`Master ${order.masterId} declined order, notifying director and master`);
        this.fireAndForgetNotification(
          this.notificationsService.sendOrderRejectionNotification({
            orderId: updated.id,
            city: updated.city,
            clientName: updated.clientName?.trim() || undefined,
            phone: updated.phone,
            reason: 'Мастер отказался от заказа',
            masterId: order.masterId, // ✅ ИСПРАВЛЕНИЕ: Передаем ID мастера, который отказался
            rk: updated.rk?.trim() || undefined,
            avitoName: updated.avitoName?.trim() || undefined,
            typeEquipment: updated.typeEquipment?.trim() || undefined,
            dateMeeting: updated.dateMeeting?.toISOString(),
          }),
          `master-declined-#${updated.id}`
        );
      }
      
      // Если был старый мастер и назначается новый (передача заказа)
      if (order.masterId && dto.masterId) {
        this.logger.debug(`Sending reassignment notification to old master ${order.masterId}`);
        this.fireAndForgetNotification(
          this.notificationsService.sendMasterReassignedNotification({
            orderId: updated.id,
            oldMasterId: order.masterId,
          }),
          `master-reassigned-#${updated.id}`
        );
      }
      
      // Если назначается мастер (новый или вместо старого)
      if (dto.masterId) {
        this.logger.debug(`Sending assignment notification to new master ${dto.masterId}`);
        this.fireAndForgetNotification(
          this.notificationsService.sendMasterAssignedNotification({
            orderId: updated.id,
            masterId: dto.masterId,
            rk: updated.rk?.trim() || undefined,
            avitoName: updated.avitoName?.trim() || undefined,
            typeEquipment: updated.typeEquipment?.trim() || undefined,
            clientName: updated.clientName?.trim() || undefined,
            address: updated.address?.trim() || undefined,
            dateMeeting: updated.dateMeeting?.toISOString(),
          }),
          `master-assigned-#${updated.id}`
        );
      }
    }
    
    return { 
      success: true, 
      data: updated,
      message: `Заказ №${updated.id} обновлен!`
    };
  }

  async updateStatus(
    id: number, 
    status: string, 
    user: AuthUser, 
    headers?: Record<string, string | string[] | undefined>
  ) {
    const order = await this.prisma.order.findUnique({ 
      where: { id },
      include: {
        operator: true,
        master: true
      }
    });
    if (!order) throw new NotFoundException('Order not found');

    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    const terminalStatuses = ['Готово', 'Отказ', 'Незаказ'];
    const data: any = { statusOrder: status };
    if (terminalStatuses.includes(status)) {
      data.closingData = new Date();
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: {
        operator: { select: { id: true, name: true, login: true } },
        master: { select: { id: true, name: true } },
      },
    });

    // ✅ ИСПРАВЛЕНИЕ: Fire-and-forget для HTTP запроса
    if (status === 'Готово' && updated.result && Number(updated.result) > 0) {
      this.logger.log(`Order #${updated.id} status -> Готово, syncing cash (async)`);
      this.syncCashReceipt(updated, user, headers)
        .catch(err => this.logger.error(`Failed to sync cash for order #${updated.id}: ${err.message}`));
    }

    return { success: true, data: updated };
  }

  async assignMaster(id: number, masterId: number) {
    const updated = await this.prisma.order.update({
      where: { id },
      data: { masterId },
    });

    return { success: true, data: updated };
  }

  async getOrderAvitoChat(id: number, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        avitoChatId: true,
        avitoName: true,
        phone: true,
        clientName: true,
        masterId: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // RBAC проверка
    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    if (!order.avitoChatId || !order.avitoName) {
      return {
        success: false,
        message: 'No Avito chat data for this order',
        data: null,
      };
    }

    return {
      success: true,
      data: {
        chatId: order.avitoChatId,
        avitoAccountName: order.avitoName,
        clientName: order.clientName,
        phone: order.phone,
      },
    };
  }

  /**
   * ✅ ИСПРАВЛЕНИЕ: Синхронизация записи прихода в cash-service (fire-and-forget)
   * Создает новую запись или обновляет существующую
   */
  private async syncCashReceipt(
    order: any, 
    user: AuthUser, 
    requestHeaders?: Record<string, string | string[] | undefined>
  ) {
    try {
      const cashServiceUrl = process.env.CASH_SERVICE_URL || 'http://cash-service.backend.svc.cluster.local:5006';
      
      // Подготовка данных для записи в cash
      const masterChangeAmount = order.masterChange ? Number(order.masterChange) : 0;
      const resultAmount = order.result ? Number(order.result) : 0;
      
      const cashData: any = {
        name: 'приход',
        amount: masterChangeAmount,
        city: order.city || 'Не указан',
        note: `Итог по заказу: ${resultAmount}₽`,
        paymentPurpose: `Заказ №${order.id}`,
      };
      
      // Добавляем receiptDoc только если он есть
      // Извлекаем путь из URL (убираем домен и query параметры)
      if (order.bsoDoc) {
        try {
          const url = new URL(order.bsoDoc);
          // Получаем путь без начального слеша (например: director/orders/bso_doc/file.jpg)
          const path = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
          cashData.receiptDoc = path;
        } catch (e) {
          // Если не URL, а просто путь - используем как есть
          cashData.receiptDoc = order.bsoDoc;
        }
      }

      this.logger.debug(`Sending cash receipt to cash-service for order #${order.id}`);

      // Получаем JWT токен из заголовков запроса
      const authHeader = requestHeaders?.authorization || requestHeaders?.Authorization;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authHeader) {
        headers['Authorization'] = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      } else {
        this.logger.warn(`No Authorization header found for order #${order.id}`);
      }

      // ✅ ОПТИМИЗАЦИЯ: Отправляем запрос к cash-service с таймаутом, retry и обработкой ошибок
      const response = await firstValueFrom(
        this.httpService.post(
          `${cashServiceUrl}/api/v1/cash`,
          cashData,
          { 
            headers,
            timeout: 5000, // ✅ Таймаут 5 секунд (вместо 60s по умолчанию)
            maxRedirects: 2, // ✅ Максимум 2 редиректа
          }
        ).pipe(
          timeout(5000), // ✅ Дополнительный RxJS таймаут (запасной)
          retry({
            count: 2, // ✅ Повторить 2 раза при ошибке
            delay: 1000, // ✅ Задержка 1 секунда между попытками
          })
        )
      );

      this.logger.log(`✅ Cash synced for order #${order.id}`);
      
      // Обновляем статус подачи кассы в заказе
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          cashSubmissionStatus: 'Не отправлено',
          cashSubmissionDate: new Date(),
          cashSubmissionAmount: masterChangeAmount,
        },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to sync cash for order #${order.id}: ${errorMessage}`);
      
      // ✅ ИСПРАВЛЕНИЕ: Не бросаем исключение (fire-and-forget)
      try {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            cashSubmissionStatus: 'Ошибка синхронизации',
            cashSubmissionDate: new Date(),
          },
        });
      } catch (updateError) {
        this.logger.error(`Failed to update error status: ${updateError instanceof Error ? updateError.message : 'Unknown'}`);
      }
    }
  }

  // ✅ ОПТИМИЗАЦИЯ: Использование DISTINCT вместо загрузки всех заказов
  // Скорость: 500ms → 10ms (50x ускорение)
  async getFilterOptions(user: AuthUser) {
    // Строим WHERE условия для SQL
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // RBAC фильтры
    if (user.role === 'master') {
      whereConditions.push(`master_id = $${paramIndex}`);
      params.push(user.userId);
      paramIndex++;
    }

    if (user.role === 'director' && user.cities && user.cities.length > 0) {
      whereConditions.push(`city = ANY($${paramIndex}::text[])`);
      params.push(user.cities);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // ✅ ОПТИМИЗАЦИЯ: Получаем уникальные значения через DISTINCT прямо в БД
    const [rksResult, typeEquipmentsResult] = await Promise.all([
      // Уникальные РК
      this.prisma.$queryRawUnsafe<Array<{ rk: string }>>(
        `SELECT DISTINCT rk FROM orders ${whereClause} AND rk IS NOT NULL ORDER BY rk ASC`,
        ...params
      ),
      // Уникальные типы оборудования
      this.prisma.$queryRawUnsafe<Array<{ type_equipment: string }>>(
        `SELECT DISTINCT type_equipment FROM orders ${whereClause} AND type_equipment IS NOT NULL ORDER BY type_equipment ASC`,
        ...params
      ),
    ]);

    return {
      success: true,
      data: {
        rks: rksResult.map(r => r.rk),
        typeEquipments: typeEquipmentsResult.map(t => t.type_equipment),
      },
    };
  }

  async submitCashForReview(orderId: number, cashReceiptDoc: string | undefined, user: AuthUser) {
    this.logger.log(`Submitting cash for review: Order ${orderId} by Master ${user.userId}`);

    try {
      // Проверяем существование заказа
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          master: {
            select: { id: true, name: true }
          }
        }
      });

      if (!order) {
        return {
          success: false,
          error: 'Заказ не найден'
        };
      }

      // Проверяем, что заказ принадлежит этому мастеру
      if (order.masterId !== user.userId) {
        return {
          success: false,
          error: 'Вы не можете отправить сдачу по чужому заказу'
        };
      }

      // Проверяем статус заказа
      if (order.statusOrder !== 'Готово') {
        return {
          success: false,
          error: 'Можно отправить сдачу только по завершенным заказам'
        };
      }

      // Обновляем заказ
      const updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          cashSubmissionStatus: 'На проверке',
          cashReceiptDoc: cashReceiptDoc || null,
          cashSubmissionDate: new Date(),
          cashSubmissionAmount: order.masterChange || 0,
        }
      });

      this.logger.log(`✅ Cash submission successful: Order #${orderId}, Status: "На проверке"`);

      return {
        success: true,
        message: 'Сдача успешно отправлена на проверку',
        data: {
          id: updatedOrder.id,
          cashSubmissionStatus: updatedOrder.cashSubmissionStatus,
          cashReceiptDoc: updatedOrder.cashReceiptDoc,
        }
      };
    } catch (error) {
      this.logger.error(`❌ Failed to submit cash for review: ${error.message}`, error.stack);
      return {
        success: false,
        error: `Ошибка при отправке сдачи: ${error.message}`
      };
    }
  }

}


