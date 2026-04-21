import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteOrderDto, UpdateSiteOrderDto, QuerySiteOrdersDto } from './dto';

@Injectable()
export class SiteOrdersService {
  constructor(private prisma: PrismaService) {}

  private readonly siteOrderSelect = {
    id: true,
    cityId: true,
    site: true,
    clientName: true,
    phone: true,
    status: true,
    comment: true,
    commentOperator: true,
    orderId: true,
    createdAt: true,
    updatedAt: true,
    city: { select: { id: true, name: true } },
  } as const;

  private withCompatCallbackAt<T extends Record<string, unknown>>(siteOrder: T) {
    return {
      ...siteOrder,
      callbackAt: null,
    };
  }

  async create(createSiteOrderDto: CreateSiteOrderDto) {
    const created = await this.prisma.siteOrder.create({
      data: createSiteOrderDto,
      select: this.siteOrderSelect,
      // status по умолчанию "Новый" (из базы)
    });

    return this.withCompatCallbackAt(created);
  }

  async findAll(query: QuerySiteOrdersDto) {
    const { status, cityId, search, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (cityId) {
      where.cityId = cityId;
    }

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { site: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.siteOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.siteOrderSelect,
      }),
      this.prisma.siteOrder.count({ where }),
    ]);

    return {
      data: data.map((item) => this.withCompatCallbackAt(item)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const siteOrder = await this.prisma.siteOrder.findUnique({
      where: { id },
      select: this.siteOrderSelect,
    });

    if (!siteOrder) {
      throw new NotFoundException(`Заявка с ID ${id} не найдена`);
    }

    return this.withCompatCallbackAt(siteOrder);
  }

  async update(id: number, updateSiteOrderDto: UpdateSiteOrderDto) {
    // Проверяем существование
    await this.findOne(id);

    const { callbackAt: _callbackAt, ...updateData } = updateSiteOrderDto;

    const updated = await this.prisma.siteOrder.update({
      where: { id },
      data: updateData,
      select: this.siteOrderSelect,
    });

    return this.withCompatCallbackAt(updated);
  }

  async remove(id: number) {
    // Проверяем существование
    await this.findOne(id);

    const deleted = await this.prisma.siteOrder.delete({
      where: { id },
      select: this.siteOrderSelect,
    });

    return this.withCompatCallbackAt(deleted);
  }

  async updateStatus(id: number, status: string, callbackAt?: string) {
    await this.findOne(id);

    const updated = await this.prisma.siteOrder.update({
      where: { id },
      data: {
        status,
      },
      select: this.siteOrderSelect,
    });

    return {
      ...this.withCompatCallbackAt(updated),
      callbackAt: status === 'Перезвонить' && callbackAt ? callbackAt : null,
    };
  }

  async linkToOrder(id: number, orderId: number) {
    // Проверяем существование заявки
    await this.findOne(id);

    const updated = await this.prisma.siteOrder.update({
      where: { id },
      data: { 
        orderId,
        status: 'Заказ создан',
      },
      select: this.siteOrderSelect,
    });

    return this.withCompatCallbackAt(updated);
  }
}
