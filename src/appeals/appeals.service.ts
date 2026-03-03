import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppealDto, UpdateAppealDto, QueryAppealsDto } from './dto/appeal.dto';

@Injectable()
export class AppealsService implements OnModuleInit {
  private readonly logger = new Logger(AppealsService.name);
  private appealStatusIds: number[] = [];
  private statusCodeToId = new Map<string, number>();
  private statusIdToCode = new Map<number, string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadAppealStatuses();
  }

  private async loadAppealStatuses() {
    const statuses = await this.prisma.orderStatus.findMany({
      where: { group: 'appeal', isActive: true },
    });
    this.appealStatusIds = statuses.map(s => s.id);
    this.statusCodeToId.clear();
    this.statusIdToCode.clear();
    for (const s of statuses) {
      this.statusCodeToId.set(s.code, s.id);
      this.statusIdToCode.set(s.id, s.code);
    }
    this.logger.log(`Loaded ${statuses.length} appeal statuses: ${statuses.map(s => s.code).join(', ')}`);
  }

  private getStatusId(code: string): number | undefined {
    return this.statusCodeToId.get(code);
  }

  async getAppeals(query: QueryAppealsDto, operatorId?: number, role?: string) {
    const { status, search, dateFrom, dateTo, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {
      statusId: { in: this.appealStatusIds },
    };

    if (role === 'operator' && operatorId) {
      where.operatorId = operatorId;
    }

    if (status) {
      const sid = this.getStatusId(status);
      if (sid) where.statusId = sid;
    }

    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, unknown>).lte = end;
      }
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          status: { select: { id: true, code: true, name: true, color: true, group: true } },
          city: { select: { id: true, name: true } },
          rk: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const enriched = data.map(order => ({
      id: order.id,
      phone: order.phone,
      clientName: order.clientName,
      description: order.description,
      source: order.source,
      status: order.status.code,
      statusName: order.status.name,
      statusColor: order.status.color,
      statusId: order.statusId,
      callId: order.callId,
      siteOrderId: order.siteOrderId,
      operatorId: order.operatorId,
      operator: order.operator,
      cityId: order.cityId,
      cityName: order.city?.name ?? null,
      rkId: order.rkId,
      rkName: order.rk?.name ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

    return {
      success: true,
      data: enriched,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAppealById(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        status: { select: { id: true, code: true, name: true, color: true, group: true } },
        city: { select: { id: true, name: true } },
        rk: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException(`Обращение с ID ${id} не найдено`);

    return {
      success: true,
      data: {
        id: order.id,
        phone: order.phone,
        clientName: order.clientName,
        description: order.description,
        source: order.source,
        status: order.status.code,
        statusName: order.status.name,
        statusColor: order.status.color,
        statusId: order.statusId,
        callId: order.callId,
        siteOrderId: order.siteOrderId,
        operatorId: order.operatorId,
        operator: order.operator,
        cityId: order.cityId,
        cityName: order.city?.name ?? null,
        rkId: order.rkId,
        rkName: order.rk?.name ?? null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    };
  }

  async createAppeal(dto: CreateAppealDto, operatorId: number) {
    let statusId = dto.statusId;
    if (!statusId) {
      await this.loadAppealStatuses();
      statusId = this.getStatusId('new');
      if (!statusId) {
        const newStatus = await this.prisma.orderStatus.findFirst({ where: { code: 'new' } });
        statusId = newStatus?.id ?? 1;
      }
    }

    const order = await this.prisma.order.create({
      data: {
        phone: dto.phone,
        clientName: dto.clientName ?? '',
        description: dto.description ?? '',
        source: dto.source,
        statusId,
        operatorId,
        cityId: dto.cityId ?? 1,
        rkId: dto.rkId ?? 1,
        callId: dto.callId,
        siteOrderId: dto.siteOrderId,
      },
      include: {
        status: { select: { id: true, code: true, name: true, color: true } },
      },
    });

    this.logger.log(`Appeal (order) #${order.id} created by operator #${operatorId} — ${order.phone}`);
    return { success: true, data: order };
  }

  async updateAppeal(id: number, dto: UpdateAppealDto) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Обращение с ID ${id} не найдено`);

    const updateData: Record<string, unknown> = {};
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.clientName !== undefined) updateData.clientName = dto.clientName;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.result !== undefined) updateData.result = dto.result;
    if (dto.statusId !== undefined) updateData.statusId = dto.statusId;
    if (dto.callId !== undefined) updateData.callId = dto.callId;
    if (dto.siteOrderId !== undefined) updateData.siteOrderId = dto.siteOrderId;
    if (dto.cityId !== undefined) updateData.cityId = dto.cityId;
    if (dto.rkId !== undefined) updateData.rkId = dto.rkId;
    if (dto.source !== undefined) updateData.source = dto.source;

    const order = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        status: { select: { id: true, code: true, name: true, color: true } },
      },
    });

    this.logger.log(`Appeal (order) #${id} updated — statusId: ${order.statusId}`);
    return { success: true, data: order };
  }

  async deleteAppeal(id: number) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Обращение с ID ${id} не найдено`);
    await this.prisma.order.delete({ where: { id } });
    this.logger.log(`Appeal (order) #${id} deleted`);
    return { success: true, message: 'Обращение удалено' };
  }

  async getStats(operatorId?: number, role?: string) {
    const where: Record<string, unknown> = {
      statusId: { in: this.appealStatusIds },
    };
    if (role === 'operator' && operatorId) {
      where.operatorId = operatorId;
    }

    const [total, byStatus] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({
        by: ['statusId'],
        where,
        _count: { statusId: true },
      }),
    ]);

    const byStatusCode: Record<string, number> = {};
    for (const row of byStatus) {
      const code = this.statusIdToCode.get(row.statusId);
      if (code) byStatusCode[code] = row._count.statusId;
    }

    return {
      success: true,
      data: { total, byStatus: byStatusCode },
    };
  }

  async getAppealStatuses() {
    const statuses = await this.prisma.orderStatus.findMany({
      where: { group: 'appeal', isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, color: true, sortOrder: true },
    });
    return { success: true, data: statuses };
  }
}
