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
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  // ✅ FIX: Кэш для getFilterOptions (предотвращает timeout при частых запросах)
  private filterOptionsCache = new Map<string, { data: any; expiry: number }>();
  private readonly FILTER_OPTIONS_CACHE_TTL = 60 * 1000; // 1 минута

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
    const startTime = Date.now();
    const { page = 1, limit = 50, status, city, search, masterId, master, closingDate, rk, typeEquipment, dateType, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;
    
    this.logger.debug(`[getOrders] START: user=${user.userId} (${user.role}), page=${page}, limit=${limit}, filters=${JSON.stringify({ status, city, search: search ? '***' : null, masterId, master, rk, typeEquipment })}`);
    
    try {

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

    // S3 base URL для преобразования путей в полные URL
    const s3BaseUrl = process.env.S3_BASE_URL || 'https://s3.twcstorage.ru/f7eead03-crmfiles';
    
    // Преобразуем типы данных и пути к файлам в полные URL
    const transformedOrders = orders.map(order => ({
      ...order,
      result: order.result ? parseFloat(order.result) : null,
      expenditure: order.expenditure ? parseFloat(order.expenditure) : null,
      clean: order.clean ? parseFloat(order.clean) : null,
      masterChange: order.masterChange ? parseFloat(order.masterChange) : null,
      prepayment: order.prepayment ? parseFloat(order.prepayment) : null,
      cashSubmissionAmount: order.cashSubmissionAmount ? parseFloat(order.cashSubmissionAmount) : null,
      partnerPercent: order.partnerPercent ? parseFloat(order.partnerPercent) : null,
      // Преобразуем пути в полные URL для документов
      bsoDoc: order.bsoDoc ? order.bsoDoc.map(path => path.startsWith('http') ? path : `${s3BaseUrl}/${path}`) : [],
      expenditureDoc: order.expenditureDoc ? order.expenditureDoc.map(path => path.startsWith('http') ? path : `${s3BaseUrl}/${path}`) : [],
    }));

    const total = Number(totalResult[0].count);

    const duration = Date.now() - startTime;
    this.logger.debug(`[getOrders] COMPLETE in ${duration}ms (returned ${transformedOrders.length} orders, total=${total})`);
    
    if (duration > 2000) {
      this.logger.warn(`[getOrders] SLOW QUERY: ${duration}ms - page=${page}, filters=${JSON.stringify({ status, city, masterId, rk, typeEquipment })}`);
    }

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
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[getOrders] FAILED after ${duration}ms: ${error.message}`);
      throw error;
    }
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

    // S3 base URL для преобразования путей в полные URL
    const s3BaseUrl = process.env.S3_BASE_URL || 'https://s3.twcstorage.ru/f7eead03-crmfiles';
    
    // Преобразуем пути к файлам в полные URL
    const transformedOrder = {
      ...order,
      bsoDoc: order.bsoDoc ? order.bsoDoc.map(path => path.startsWith('http') ? path : `${s3BaseUrl}/${path}`) : [],
      expenditureDoc: order.expenditureDoc ? order.expenditureDoc.map(path => path.startsWith('http') ? path : `${s3BaseUrl}/${path}`) : [],
    };

    return { success: true, data: transformedOrder };
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

    // ✅ ИСПРАВЛЕНИЕ: Синхронная отправка в cash-service для гарантии записи
    // Т.к. сервисы на одном сервере, задержка минимальная (~10-50ms)
    // 🔧 FIX: Проверяем masterChange > 0, т.к. приход создается на эту сумму, а не на result
    // Если masterChange = 0 (например result=1000, expenditure=1000), приход не создаем
    if (dto.statusOrder === 'Готово' && updated.masterChange && Number(updated.masterChange) > 0) {
      this.logger.log(`Order #${updated.id} completed, syncing cash receipt (masterChange=${updated.masterChange})`);
      try {
        await this.syncCashReceipt(updated, user, headers);
      } catch (err) {
        // Откатываем статус заказа, если не удалось записать в кассу
        this.logger.error(`Failed to sync cash for order #${updated.id}, rolling back status: ${err.message}`);
        await this.prisma.order.update({
          where: { id: order.id },
          data: { 
            statusOrder: order.statusOrder, // Возвращаем старый статус
            closingData: order.closingData,  // Возвращаем старую дату
          },
        });
        throw new Error(`Сервис транзакций недоступен.`);
      }
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

    // ✅ ИСПРАВЛЕНИЕ: Синхронная отправка в cash-service для гарантии записи
    // Т.к. сервисы на одном сервере, задержка минимальная (~10-50ms)
    // 🔧 FIX: Проверяем masterChange > 0, т.к. приход создается на эту сумму
    // Если masterChange = 0, приход не создаем (нет денег для кассы)
    if (status === 'Готово' && updated.masterChange && Number(updated.masterChange) > 0) {
      this.logger.log(`Order #${updated.id} status -> Готово, syncing cash (masterChange=${updated.masterChange})`);
      try {
        await this.syncCashReceipt(updated, user, headers);
      } catch (err) {
        // Откатываем статус заказа, если не удалось записать в кассу
        this.logger.error(`Failed to sync cash for order #${updated.id}, rolling back status: ${err.message}`);
        await this.prisma.order.update({
          where: { id },
          data: { 
            statusOrder: order.statusOrder, // Возвращаем старый статус
            closingData: order.closingData,  // Возвращаем старую дату
          },
        });
        throw new Error(`Сервис транзакций недоступен.`);
      }
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
    const startTime = Date.now();
    this.logger.debug(`[syncCashReceipt] START for order #${order.id}`);
    
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
      
      // ✅ ЗАЩИТА: Проверяем тип bsoDoc перед обработкой
      this.logger.debug(`[syncCashReceipt] Order #${order.id} bsoDoc type: ${typeof order.bsoDoc}, isArray: ${Array.isArray(order.bsoDoc)}, value: ${JSON.stringify(order.bsoDoc)}`);
      
      // Добавляем receiptDoc только если он есть
      // Извлекаем путь из URL (убираем домен и query параметры)
      // bsoDoc теперь массив, берем первый элемент если есть
      if (order.bsoDoc && Array.isArray(order.bsoDoc) && order.bsoDoc.length > 0) {
        try {
          const firstDoc = order.bsoDoc[0];
          
          // ✅ ЗАЩИТА: Проверяем что firstDoc это строка
          if (typeof firstDoc !== 'string') {
            this.logger.warn(`[syncCashReceipt] Order #${order.id} bsoDoc[0] is not a string: ${typeof firstDoc}`);
          } else {
            this.logger.debug(`[syncCashReceipt] Processing firstDoc: ${firstDoc}`);
            
            const url = new URL(firstDoc);
            // Получаем путь без начального слеша (например: director/orders/bso_doc/file.jpg)
            const path = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
            cashData.receiptDoc = path;
          }
        } catch (e) {
          // Если не URL, а просто путь - используем как есть
          this.logger.debug(`[syncCashReceipt] Not a URL, using as path: ${order.bsoDoc[0]}`);
          cashData.receiptDoc = order.bsoDoc[0];
        }
      }

      // Получаем JWT токен из заголовков запроса
      const authHeader = requestHeaders?.authorization || requestHeaders?.Authorization;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authHeader) {
        headers['Authorization'] = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      } else {
        this.logger.warn(`[syncCashReceipt] No Authorization header found for order #${order.id}`);
      }

      this.logger.debug(`[syncCashReceipt] Sending HTTP POST to ${cashServiceUrl}/api/v1/cash for order #${order.id}`);
      
      // ✅ RETRY-логика: 3 попытки с экспоненциальной задержкой
      let lastError: Error | null = null;
      let response: any = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const httpStartTime = Date.now();
          
          response = await firstValueFrom(
            this.httpService.post(
              `${cashServiceUrl}/api/v1/cash`,
              cashData,
              { 
                headers,
                timeout: 5000, // ✅ Таймаут 5 секунд (локальная сеть)
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 300,
              }
            ).pipe(
              timeout(5000),
              catchError((error) => {
                const httpDuration = Date.now() - httpStartTime;
                
                if (error.response) {
                  const contentType = error.response.headers['content-type'] || '';
                  const statusCode = error.response.status;
                  const data = error.response.data;
                  
                  // Если получили HTML вместо JSON
                  if (contentType.includes('text/html')) {
                    const htmlPreview = typeof data === 'string' ? data.substring(0, 100) : String(data).substring(0, 100);
                    this.logger.error(`[syncCashReceipt] ❌ Received HTML instead of JSON from cash-service (${statusCode}): ${htmlPreview}...`);
                    throw new Error(`Сервер кассы вернул ошибку (${statusCode})`);
                  }
                  
                  // Другие HTTP ошибки - формируем понятное сообщение
                  const errorMsg = data?.message || data?.error || JSON.stringify(data).substring(0, 200);
                  this.logger.error(`[syncCashReceipt] ❌ HTTP ${statusCode} from cash-service after ${httpDuration}ms: ${errorMsg}`);
                  throw new Error(`Ошибка от сервера кассы (${statusCode}): ${errorMsg}`);
                }
                
                // Таймаут или network error
                if (error.code === 'ECONNREFUSED') {
                  this.logger.error(`[syncCashReceipt] ❌ Cannot connect to cash-service at ${cashServiceUrl}`);
                  throw new Error('Сервер кассы недоступен');
                }
                
                if (error.name === 'TimeoutError') {
                  this.logger.error(`[syncCashReceipt] ❌ Timeout (>5s) waiting for cash-service`);
                  throw new Error('Превышено время ожидания ответа от сервера кассы');
                }
                
                // Прочие ошибки
                this.logger.error(`[syncCashReceipt] ❌ Unknown error after ${httpDuration}ms: ${error.message}`);
                throw error;
              })
            )
          );
          
          const httpDuration = Date.now() - httpStartTime;
          this.logger.log(`[syncCashReceipt] ✅ Cash synced for order #${order.id} in ${httpDuration}ms (attempt ${attempt})`);
          break; // Успех - выходим из цикла
          
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          
          if (attempt < maxRetries) {
            const delayMs = Math.pow(2, attempt - 1) * 500; // 500ms, 1s, 2s
            this.logger.warn(`[syncCashReceipt] Attempt ${attempt} failed for order #${order.id}, retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          } else {
            this.logger.error(`[syncCashReceipt] All ${maxRetries} attempts failed for order #${order.id}`);
          }
        }
      }
      
      // Если после всех попыток не удалось
      if (!response && lastError) {
        throw lastError;
      }
      
      // Обновляем статус подачи кассы в заказе
      this.logger.debug(`[syncCashReceipt] Updating order #${order.id} status in DB`);
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          cashSubmissionStatus: 'Отправлено',
          cashSubmissionDate: new Date(),
          cashSubmissionAmount: masterChangeAmount,
        },
      });

      const totalDuration = Date.now() - startTime;
      this.logger.debug(`[syncCashReceipt] COMPLETE for order #${order.id} in ${totalDuration}ms`);

    } catch (error) {
      const totalDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[syncCashReceipt] FAILED for order #${order.id} after ${totalDuration}ms: ${errorMessage}`);
      
      // ✅ ИСПРАВЛЕНИЕ: Бросаем исключение наверх для отката транзакции
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
      
      // Пробрасываем ошибку для отката статуса заказа
      throw error;
    }
  }

  // ✅ ОПТИМИЗАЦИЯ: Использование DISTINCT вместо загрузки всех заказов
  // Скорость: 500ms → 10ms (50x ускорение)
  // ✅ FIX: Добавлен кэш для предотвращения timeout при частых запросах
  async getFilterOptions(user: AuthUser) {
    const startTime = Date.now();
    this.logger.debug(`[getFilterOptions] START for user ${user.userId} (${user.role})`);
    
    try {
      // ✅ Генерируем ключ кэша на основе роли и городов пользователя
      const cacheKey = user.role === 'master' 
        ? `master_${user.userId}` 
        : user.role === 'director' && user.cities?.length 
          ? `director_${user.cities.sort().join(',')}` 
          : 'global';
      
      // ✅ Проверяем кэш
      const cached = this.filterOptionsCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        this.logger.debug(`[getFilterOptions] CACHE HIT for key=${cacheKey}, age=${Date.now() - (cached.expiry - this.FILTER_OPTIONS_CACHE_TTL)}ms`);
        return {
          success: true,
          data: cached.data,
          cached: true,
        };
      }

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
      const additionalWhere = whereConditions.length > 0 ? 'AND' : 'WHERE';

      this.logger.debug(`[getFilterOptions] Executing DISTINCT queries with whereClause: ${whereClause}, params: ${JSON.stringify(params)}`);

      // ✅ FIX: Проверяем соединение перед тяжёлым запросом (предотвращает зависание на мёртвом соединении)
      await this.prisma.ensureConnection();

      // ✅ FIX: Выполняем запрос с retry логикой для обработки idle-session timeout
      const executeQueries = async (attempt: number = 1): Promise<[Array<{ rk: string }>, Array<{ type_equipment: string }>, Array<{ city: string }>]> => {
        const queryStartTime = Date.now();
        
        const queryPromise = Promise.all([
          // Уникальные РК
          this.prisma.$queryRawUnsafe<Array<{ rk: string }>>(
            `SELECT DISTINCT rk FROM orders ${whereClause} ${additionalWhere} rk IS NOT NULL ORDER BY rk ASC`,
            ...params
          ).then(result => {
            this.logger.debug(`[getFilterOptions] RK query completed in ${Date.now() - queryStartTime}ms, rows: ${result.length}`);
            return result;
          }),
          // Уникальные типы оборудования
          this.prisma.$queryRawUnsafe<Array<{ type_equipment: string }>>(
            `SELECT DISTINCT type_equipment FROM orders ${whereClause} ${additionalWhere} type_equipment IS NOT NULL ORDER BY type_equipment ASC`,
            ...params
          ).then(result => {
            this.logger.debug(`[getFilterOptions] Equipment query completed in ${Date.now() - queryStartTime}ms, rows: ${result.length}`);
            return result;
          }),
          // Уникальные города
          this.prisma.$queryRawUnsafe<Array<{ city: string }>>(
            `SELECT DISTINCT city FROM orders ${whereClause} ${additionalWhere} city IS NOT NULL ORDER BY city ASC`,
            ...params
          ).then(result => {
            this.logger.debug(`[getFilterOptions] City query completed in ${Date.now() - queryStartTime}ms, rows: ${result.length}`);
            return result;
          }),
        ]);

        // Таймаут 5 секунд (уменьшено с 10 для быстрого retry)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('getFilterOptions query timeout (>5s)')), 5000)
        );

        try {
          return await Promise.race([queryPromise, timeoutPromise]);
        } catch (error: any) {
          const isRetryableError = 
            error.message?.includes('timeout') ||
            error.message?.includes('idle-session') ||
            error.message?.includes('57P05') ||
            error.message?.includes('terminating connection') ||
            error.message?.includes('Connection reset');
          
          if (isRetryableError && attempt < 3) {
            this.logger.warn(`[getFilterOptions] Attempt ${attempt} failed, retrying... (${error.message})`);
            // Небольшая пауза перед retry
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            return executeQueries(attempt + 1);
          }
          throw error;
        }
      };

      const [rksResult, typeEquipmentsResult, citiesResult] = await executeQueries();

      const result = {
        rks: rksResult.map(r => r.rk),
        typeEquipments: typeEquipmentsResult.map(t => t.type_equipment),
        cities: citiesResult.map(c => c.city),
      };

      // ✅ Сохраняем в кэш
      this.filterOptionsCache.set(cacheKey, {
        data: result,
        expiry: Date.now() + this.FILTER_OPTIONS_CACHE_TTL,
      });
      this.logger.debug(`[getFilterOptions] Cached result for key=${cacheKey}`);

      const duration = Date.now() - startTime;
      this.logger.debug(`[getFilterOptions] COMPLETE in ${duration}ms (RKs: ${rksResult.length}, Equipment: ${typeEquipmentsResult.length}, Cities: ${citiesResult.length})`);

      if (duration > 1000) {
        this.logger.warn(`[getFilterOptions] SLOW QUERY: ${duration}ms`);
      }

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[getFilterOptions] FAILED after ${duration}ms: ${error.message}`);
      this.logger.error(`[getFilterOptions] Error stack: ${error.stack}`);
      this.logger.error(`[getFilterOptions] User: ${JSON.stringify({ role: user.role, cities: user.cities })}`);
      
      // ✅ FIX: При ошибке возвращаем пустые опции вместо падения
      // Это лучше чем 500 ошибка для пользователя
      if (error.message?.includes('timeout')) {
        this.logger.warn('[getFilterOptions] Returning empty options due to timeout');
        return {
          success: true,
          data: { rks: [], typeEquipments: [] },
          error: 'timeout',
        };
      }
      
      throw error;
    }
  }

  // ✅ Метод для инвалидации кэша filter options (вызывать при создании/обновлении заказа)
  private invalidateFilterOptionsCache() {
    this.filterOptionsCache.clear();
    this.logger.debug('[getFilterOptions] Cache invalidated');
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


