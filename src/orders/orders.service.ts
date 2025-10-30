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
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
  ) {}

  // ✅ ИСПРАВЛЕНИЕ: Строгая типизация вместо any
  async getOrders(query: QueryOrdersDto, user: AuthUser) {
    const { page = 1, limit = 50, status, city, search, masterId, master, closingDate } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    // RBAC фильтры
    if (user.role === 'master') {
      where.masterId = user.userId;
    }

    if (user.role === 'director' && user.cities) {
      where.city = { in: user.cities };
    }

    // Оператор видит ВСЕ заказы

    // Фильтры из query
    if (status) where.statusOrder = status;
    if (city) where.city = city;
    if (masterId) where.masterId = +masterId;
    
    // Фильтр по имени мастера
    if (master) {
      where.master = {
        name: { contains: master, mode: 'insensitive' }
      };
    }
    
    // Фильтр по дате закрытия
    if (closingDate) {
      const date = new Date(closingDate);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      where.closingData = {
        gte: date,
        lt: nextDay
      };
    }
    
    if (search) {
      const searchConditions: any[] = [
        { phone: { contains: search } },
        { clientName: { contains: search } },
        { address: { contains: search } },
      ];
      
      // Если search - это число, добавляем поиск по ID
      const searchAsNumber = parseInt(search, 10);
      if (!isNaN(searchAsNumber)) {
        searchConditions.push({ id: searchAsNumber });
      }
      
      where.OR = searchConditions;
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createDate: 'desc' },
        include: {
          operator: { select: { id: true, name: true, login: true } },
          master: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      success: true,
      data: {
        orders: data,
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
    if (dto.masterId !== undefined && dto.masterId !== null) updateData.masterId = dto.masterId;
    
    // Финансовые поля
    if (dto.result !== undefined && dto.result !== null) updateData.result = dto.result;
    if (dto.expenditure !== undefined && dto.expenditure !== null) updateData.expenditure = dto.expenditure;
    if (dto.clean !== undefined && dto.clean !== null) updateData.clean = dto.clean;
    if (dto.masterChange !== undefined && dto.masterChange !== null) updateData.masterChange = dto.masterChange;
    if (dto.prepayment !== undefined && dto.prepayment !== null) updateData.prepayment = dto.prepayment;
    
    // Документы
    if (dto.bsoDoc !== undefined && dto.bsoDoc !== null) updateData.bsoDoc = dto.bsoDoc;
    if (dto.expenditureDoc !== undefined && dto.expenditureDoc !== null) updateData.expenditureDoc = dto.expenditureDoc;
    if (dto.cashReceiptDoc !== undefined && dto.cashReceiptDoc !== null) updateData.cashReceiptDoc = dto.cashReceiptDoc;
    
    // Дополнительные поля
    if (dto.comment !== undefined && dto.comment !== null) updateData.comment = dto.comment;
    if (dto.cashSubmissionStatus !== undefined && dto.cashSubmissionStatus !== null) updateData.cashSubmissionStatus = dto.cashSubmissionStatus;
    if (dto.cashSubmissionAmount !== undefined && dto.cashSubmissionAmount !== null) updateData.cashSubmissionAmount = dto.cashSubmissionAmount;
    
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
      
      const cashData = {
        name: 'приход',
        amount: masterChangeAmount,
        city: order.city || 'Не указан',
        note: `Итог по заказу: ${resultAmount}₽`,
        paymentPurpose: `Заказ №${order.id}`,
        receiptDoc: order.bsoDoc || null,
      };

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

      // Отправляем запрос к cash-service
      const response = await firstValueFrom(
        this.httpService.post(
          `${cashServiceUrl}/api/v1/cash`,
          cashData,
          { headers }
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


