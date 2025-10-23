import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
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
        createDate: new Date(),
        dateMeeting: new Date(dto.dateMeeting),
      },
      include: {
        operator: true,
        master: true,
      },
    });

    return { success: true, data: order };
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
      .join(', ');

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
        statusOrder: 'Новый',
        operatorNameId: mainCall.operatorId,
        callId: allCallIds,
        createDate: new Date(),
      },
      include: {
        operator: true,
        master: true,
      },
    });

    return { success: true, data: order };
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
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();

    // RBAC проверка
    if (user.role === 'master' && order.masterId !== user.userId) {
      throw new ForbiddenException();
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        ...dto,
        closingData: dto.closingData ? new Date(dto.closingData) : undefined,
      },
    });

    return { success: true, data: updated };
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

  async approveFinances(id: number, directorId: number) {
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        cashApprovedBy: directorId,
        cashApprovedDate: new Date(),
        cashSubmissionStatus: 'Утверждено',
      },
    });

    return { success: true, data: updated };
  }
}

