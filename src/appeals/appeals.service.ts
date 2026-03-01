import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppealDto, UpdateAppealDto, QueryAppealsDto } from './dto/appeal.dto';

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAppeals(query: QueryAppealsDto, operatorId?: number, role?: string) {
    const {
      status,
      category,
      search,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = query;

    const where: Record<string, unknown> = {};

    // Операторы видят только свои обращения, директора/admins — все
    if (role === 'operator' && operatorId) {
      where.operatorId = operatorId;
    }

    if (status) where.status = status;
    if (category) where.category = category;

    if (search) {
      where.OR = [
        { clientPhone: { contains: search, mode: 'insensitive' } },
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
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAppealById(id: number) {
    const appeal = await this.findOrFail(id);
    return { success: true, data: appeal };
  }

  async createAppeal(dto: CreateAppealDto, operatorId: number) {
    const appeal = await this.prisma.appeal.create({
      data: {
        clientPhone: dto.clientPhone,
        clientName: dto.clientName,
        category: dto.category,
        description: dto.description,
        result: dto.result,
        status: dto.status ?? 'new',
        callId: dto.callId,
        siteOrderId: dto.siteOrderId,
        orderId: dto.orderId,
        operatorId,
      },
    });

    this.logger.log(
      `Appeal #${appeal.id} created by operator #${operatorId} — ${appeal.clientPhone} [${appeal.category}]`,
    );

    return { success: true, data: appeal };
  }

  async updateAppeal(id: number, dto: UpdateAppealDto) {
    await this.findOrFail(id);

    const appeal = await this.prisma.appeal.update({
      where: { id },
      data: {
        ...(dto.clientPhone !== undefined && { clientPhone: dto.clientPhone }),
        ...(dto.clientName !== undefined && { clientName: dto.clientName }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.result !== undefined && { result: dto.result }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.callId !== undefined && { callId: dto.callId }),
        ...(dto.siteOrderId !== undefined && { siteOrderId: dto.siteOrderId }),
        ...(dto.orderId !== undefined && { orderId: dto.orderId }),
      },
    });

    this.logger.log(`Appeal #${id} updated — status: ${appeal.status}`);
    return { success: true, data: appeal };
  }

  async deleteAppeal(id: number) {
    await this.findOrFail(id);
    await this.prisma.appeal.delete({ where: { id } });
    this.logger.log(`Appeal #${id} deleted`);
    return { success: true, message: 'Обращение удалено' };
  }

  async getStats(operatorId?: number, role?: string) {
    const where: Record<string, unknown> = {};
    if (role === 'operator' && operatorId) {
      where.operatorId = operatorId;
    }

    const [total, byStatus, byCategory] = await Promise.all([
      this.prisma.appeal.count({ where }),
      this.prisma.appeal.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.appeal.groupBy({
        by: ['category'],
        where,
        _count: { category: true },
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.status])),
        byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count.category])),
      },
    };
  }

  private async findOrFail(id: number) {
    const appeal = await this.prisma.appeal.findUnique({ where: { id } });
    if (!appeal) throw new NotFoundException(`Обращение с ID ${id} не найдено`);
    return appeal;
  }
}
