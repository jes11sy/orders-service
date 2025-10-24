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
    console.log('Updating order:', id, 'with data:', JSON.stringify(dto));
    
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();

    // RBAC проверка
    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException();
    }

    // Создаем объект обновления, включая null значения
    const updateData: any = {};
    
    // Обрабатываем каждое поле отдельно
    if (dto.statusOrder !== undefined) updateData.statusOrder = dto.statusOrder;
    if (dto.masterId !== undefined) updateData.masterId = dto.masterId;
    if (dto.result !== undefined) updateData.result = dto.result;
    if (dto.expenditure !== undefined) updateData.expenditure = dto.expenditure;
    if (dto.clean !== undefined) updateData.clean = dto.clean;
    if (dto.masterChange !== undefined) updateData.masterChange = dto.masterChange;
    if (dto.bsoDoc !== undefined) updateData.bsoDoc = dto.bsoDoc;
    if (dto.expenditureDoc !== undefined) updateData.expenditureDoc = dto.expenditureDoc;
    if (dto.prepayment !== undefined) updateData.prepayment = dto.prepayment;
    if (dto.comment !== undefined) updateData.comment = dto.comment;
    if (dto.cashSubmissionStatus !== undefined) updateData.cashSubmissionStatus = dto.cashSubmissionStatus;
    if (dto.cashSubmissionAmount !== undefined) updateData.cashSubmissionAmount = dto.cashSubmissionAmount;
    if (dto.cashReceiptDoc !== undefined) updateData.cashReceiptDoc = dto.cashReceiptDoc;
    
    // Обрабатываем дату отдельно
    if (dto.closingData !== undefined) {
      updateData.closingData = dto.closingData ? new Date(dto.closingData) : null;
    }

    console.log('Filtered update data:', JSON.stringify(updateData));

    const updated = await this.prisma.order.update({
      where: { id },
      data: updateData,
    });

    console.log('Order updated successfully:', updated.id);
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

    const updated = await this.prisma.order.update({
      where: { id },
      data: { statusOrder: status },
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

