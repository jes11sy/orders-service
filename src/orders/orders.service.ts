import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
import { CreateOrderFromChatDto } from './dto/create-order-from-chat.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UserRole } from '../auth/roles.guard';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async getOrders(query: any, user: any) {
    const { page = 1, limit = 50, status, city, search, masterId } = query;
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
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { clientName: { contains: search } },
        { address: { contains: search } },
      ];
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

  async createOrder(dto: CreateOrderDto, user: any) {
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

  async createOrderFromCall(dto: CreateOrderFromCallDto, user: any) {
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

  async createOrderFromChat(dto: CreateOrderFromChatDto, user: any) {
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

  async getOrder(id: number, user: any) {
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

  async updateOrder(id: number, dto: UpdateOrderDto, user: any) {
    console.log('=== UPDATE ORDER DEBUG ===');
    console.log('Order ID:', id);
    console.log('DTO received:', JSON.stringify(dto, null, 2));
    console.log('User:', JSON.stringify(user, null, 2));
    
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();

    console.log('Current order data:', JSON.stringify(order, null, 2));

    // RBAC проверка
    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException();
    }

    // Создаем объект обновления, включая null значения
    const updateData: any = {};
    
    // Обрабатываем каждое поле отдельно с детальным логированием
    console.log('Processing fields:');
    
    // Основные поля заказа
    if (dto.rk !== undefined && dto.rk !== null) {
      updateData.rk = dto.rk;
      console.log('✓ rk:', dto.rk);
    }
    if (dto.city !== undefined && dto.city !== null) {
      updateData.city = dto.city;
      console.log('✓ city:', dto.city);
    }
    if (dto.avitoName !== undefined && dto.avitoName !== null) {
      updateData.avitoName = dto.avitoName;
      console.log('✓ avitoName:', dto.avitoName);
    }
    if (dto.phone !== undefined && dto.phone !== null) {
      updateData.phone = dto.phone;
      console.log('✓ phone:', dto.phone);
    }
    if (dto.typeOrder !== undefined && dto.typeOrder !== null) {
      updateData.typeOrder = dto.typeOrder;
      console.log('✓ typeOrder:', dto.typeOrder);
    }
    if (dto.clientName !== undefined && dto.clientName !== null) {
      updateData.clientName = dto.clientName;
      console.log('✓ clientName:', dto.clientName);
    }
    if (dto.address !== undefined && dto.address !== null) {
      updateData.address = dto.address;
      console.log('✓ address:', dto.address);
    }
    if (dto.typeEquipment !== undefined && dto.typeEquipment !== null) {
      updateData.typeEquipment = dto.typeEquipment;
      console.log('✓ typeEquipment:', dto.typeEquipment);
    }
    if (dto.problem !== undefined && dto.problem !== null) {
      updateData.problem = dto.problem;
      console.log('✓ problem:', dto.problem);
    }
    if (dto.avitoChatId !== undefined && dto.avitoChatId !== null) {
      updateData.avitoChatId = dto.avitoChatId;
      console.log('✓ avitoChatId:', dto.avitoChatId);
    }
    if (dto.callId !== undefined && dto.callId !== null) {
      updateData.callId = dto.callId;
      console.log('✓ callId:', dto.callId);
    }
    if (dto.operatorNameId !== undefined && dto.operatorNameId !== null) {
      updateData.operatorNameId = dto.operatorNameId;
      console.log('✓ operatorNameId:', dto.operatorNameId);
    }
    
    // Поля статуса и мастера
    if (dto.statusOrder !== undefined && dto.statusOrder !== null) {
      updateData.statusOrder = dto.statusOrder;
      console.log('✓ statusOrder:', dto.statusOrder);
      // Если статус терминальный и closingData не передан явно, выставляем текущую дату закрытия
      const terminalStatuses = ['Готово', 'Отказ', 'Незаказ'];
      if (terminalStatuses.includes(dto.statusOrder) && dto.closingData === undefined) {
        updateData.closingData = new Date();
        console.log('✓ closingData (auto):', updateData.closingData);
      }
    }
    if (dto.masterId !== undefined && dto.masterId !== null) {
      updateData.masterId = dto.masterId;
      console.log('✓ masterId:', dto.masterId);
    }
    
    // Финансовые поля
    if (dto.result !== undefined && dto.result !== null) {
      updateData.result = dto.result;
      console.log('✓ result:', dto.result);
    }
    if (dto.expenditure !== undefined && dto.expenditure !== null) {
      updateData.expenditure = dto.expenditure;
      console.log('✓ expenditure:', dto.expenditure);
    }
    if (dto.clean !== undefined && dto.clean !== null) {
      updateData.clean = dto.clean;
      console.log('✓ clean:', dto.clean);
    }
    if (dto.masterChange !== undefined && dto.masterChange !== null) {
      updateData.masterChange = dto.masterChange;
      console.log('✓ masterChange:', dto.masterChange);
    }
    if (dto.prepayment !== undefined && dto.prepayment !== null) {
      updateData.prepayment = dto.prepayment;
      console.log('✓ prepayment:', dto.prepayment);
    }
    
    // Документы
    if (dto.bsoDoc !== undefined && dto.bsoDoc !== null) {
      updateData.bsoDoc = dto.bsoDoc;
      console.log('✓ bsoDoc:', dto.bsoDoc);
    }
    if (dto.expenditureDoc !== undefined && dto.expenditureDoc !== null) {
      updateData.expenditureDoc = dto.expenditureDoc;
      console.log('✓ expenditureDoc:', dto.expenditureDoc);
    }
    if (dto.cashReceiptDoc !== undefined && dto.cashReceiptDoc !== null) {
      updateData.cashReceiptDoc = dto.cashReceiptDoc;
      console.log('✓ cashReceiptDoc:', dto.cashReceiptDoc);
    }
    
    // Дополнительные поля
    if (dto.comment !== undefined && dto.comment !== null) {
      updateData.comment = dto.comment;
      console.log('✓ comment:', dto.comment);
    }
    if (dto.cashSubmissionStatus !== undefined && dto.cashSubmissionStatus !== null) {
      updateData.cashSubmissionStatus = dto.cashSubmissionStatus;
      console.log('✓ cashSubmissionStatus:', dto.cashSubmissionStatus);
    }
    if (dto.cashSubmissionAmount !== undefined && dto.cashSubmissionAmount !== null) {
      updateData.cashSubmissionAmount = dto.cashSubmissionAmount;
      console.log('✓ cashSubmissionAmount:', dto.cashSubmissionAmount);
    }
    
    // Обрабатываем даты отдельно
    if (dto.dateMeeting !== undefined && dto.dateMeeting !== null) {
      updateData.dateMeeting = dto.dateMeeting ? new Date(dto.dateMeeting) : null;
      console.log('✓ dateMeeting:', dto.dateMeeting, '->', updateData.dateMeeting);
    }
    if (dto.closingData !== undefined && dto.closingData !== null) {
      updateData.closingData = dto.closingData ? new Date(dto.closingData) : null;
      console.log('✓ closingData:', dto.closingData, '->', updateData.closingData);
    }

    console.log('Final update data:', JSON.stringify(updateData, null, 2));

    const updated = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        operator: { select: { id: true, name: true, login: true } },
        master: { select: { id: true, name: true } },
      },
    });

    console.log('Order updated successfully:', updated.id);
    console.log('Updated order data:', JSON.stringify(updated, null, 2));
    console.log('=== END UPDATE DEBUG ===');
    
    return { 
      success: true, 
      data: updated,
      message: `Заказ №${updated.id} обновлен!`
    };
  }

  async updateStatus(id: number, status: string, user: any) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();

    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException();
    }

    const terminalStatuses = ['Готово', 'Отказ', 'Незаказ'];
    const data: any = { statusOrder: status };
    if (terminalStatuses.includes(status)) {
      data.closingData = new Date();
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
    });

    return { success: true, data: updated };
  }

  async assignMaster(id: number, masterId: number) {
    const updated = await this.prisma.order.update({
      where: { id },
      data: { masterId },
    });

    return { success: true, data: updated };
  }

}

