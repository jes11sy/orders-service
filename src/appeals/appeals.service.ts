import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppealDto, UpdateAppealDto, QueryAppealsDto } from './dto/appeal.dto';

@Injectable()
export class AppealsService implements OnModuleInit {
  private readonly logger = new Logger(AppealsService.name);
  private statusMeta = new Map<string, { id: number; name: string; color: string | null }>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadAppealStatuses();
  }

  private async loadAppealStatuses() {
    const statuses = await this.prisma.orderStatus.findMany({
      where: { group: 'appeal', isActive: true },
    });
    this.statusMeta.clear();
    for (const s of statuses) {
      this.statusMeta.set(s.code, { id: s.id, name: s.name, color: s.color });
    }
    this.logger.log(`Loaded ${statuses.length} appeal statuses: ${statuses.map(s => s.code).join(', ')}`);
  }

  private getStatusMeta(code: string) {
    return this.statusMeta.get(code);
  }

  private normalizeSourceType(source?: string, siteOrderId?: number, callId?: string) {
    const allowed = new Set(['call', 'chat', 'site_order', 'manual']);
    if (source && allowed.has(source)) return source;
    if (siteOrderId) return 'site_order';
    if (callId) return 'call';
    return 'manual';
  }

  private normalizeCategory(status?: string) {
    if (status === 'callback') return 'callback';
    if (status === 'complaint') return 'complaint';
    if (status === 'consultation') return 'consultation';
    return 'order';
  }

  private toResponse(appeal: any) {
    const meta = this.getStatusMeta(appeal.status);
    return {
      id: appeal.id,
      phone: appeal.phone,
      clientName: null,
      description: appeal.description,
      source: appeal.sourceType,
      status: appeal.status,
      statusName: meta?.name ?? appeal.status,
      statusColor: meta?.color ?? null,
      statusId: meta?.id ?? null,
      callId: appeal.callId,
      siteOrderId: appeal.siteOrderId,
      operatorId: appeal.operatorId,
      cityId: appeal.cityId,
      cityName: null,
      rkId: null,
      rkName: null,
      callbackAt: appeal.callbackAt,
      createdAt: appeal.createdAt,
      updatedAt: appeal.updatedAt,
    };
  }

  async getAppeals(query: QueryAppealsDto, operatorId?: number, role?: string) {
    const { status, search, dateFrom, dateTo, cityId, operatorId: qOperatorId, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {};

    if (role === 'operator' && operatorId) {
      where.operatorId = operatorId;
    }

    if (qOperatorId) {
      where.operatorId = qOperatorId;
    }

    if (cityId) {
      where.cityId = cityId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
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
      this.prisma.appeal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appeal.count({ where }),
    ]);

    return {
      success: true,
      data: data.map((appeal) => this.toResponse(appeal)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAppealById(id: number) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
    });
    if (!appeal) throw new NotFoundException(`Обращение с ID ${id} не найдено`);

    return {
      success: true,
      data: this.toResponse(appeal),
    };
  }

  async createAppeal(dto: CreateAppealDto, operatorId: number) {
    const appeal = await this.prisma.appeal.create({
      data: {
        phone: dto.phone,
        description: dto.description ?? null,
        status: dto.status ?? 'new',
        operatorId,
        cityId: dto.cityId ?? 1,
        category: this.normalizeCategory(dto.status),
        sourceType: this.normalizeSourceType(dto.source, dto.siteOrderId, dto.callId),
        callId: dto.callId ? Number(dto.callId) || null : null,
        siteOrderId: dto.siteOrderId,
      },
    });

    this.logger.log(`Appeal #${appeal.id} created by operator #${operatorId} — ${appeal.phone}`);
    return { success: true, data: this.toResponse(appeal) };
  }

  async updateAppeal(id: number, dto: UpdateAppealDto) {
    const existing = await this.prisma.appeal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Обращение с ID ${id} не найдено`);

    const updateData: Record<string, unknown> = {};
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      updateData.category = this.normalizeCategory(dto.status);
    }
    if (dto.callId !== undefined) updateData.callId = dto.callId ? Number(dto.callId) || null : null;
    if (dto.siteOrderId !== undefined) updateData.siteOrderId = dto.siteOrderId;
    if (dto.cityId !== undefined) updateData.cityId = dto.cityId;
    if (dto.source !== undefined) updateData.sourceType = this.normalizeSourceType(dto.source, dto.siteOrderId ?? existing.siteOrderId ?? undefined, dto.callId ?? String(existing.callId ?? ''));

    const appeal = await this.prisma.appeal.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Appeal #${id} updated — status=${appeal.status}`);
    return { success: true, data: this.toResponse(appeal) };
  }

  async deleteAppeal(id: number) {
    const existing = await this.prisma.appeal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Обращение с ID ${id} не найдено`);
    await this.prisma.appeal.delete({ where: { id } });
    this.logger.log(`Appeal #${id} deleted`);
    return { success: true, message: 'Обращение удалено' };
  }

  async getStats(operatorId?: number, role?: string) {
    const where: Record<string, unknown> = {
    };
    if (role === 'operator' && operatorId) {
      where.operatorId = operatorId;
    }

    const [total, byStatus] = await Promise.all([
      this.prisma.appeal.count({ where }),
      this.prisma.appeal.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
    ]);

    const byStatusCode: Record<string, number> = {};
    for (const row of byStatus) {
      byStatusCode[row.status] = row._count.status;
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
