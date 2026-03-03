import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteOrderDto, UpdateSiteOrderDto, QuerySiteOrdersDto } from './dto';

@Injectable()
export class SiteOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(createSiteOrderDto: CreateSiteOrderDto) {
    return this.prisma.siteOrder.create({
      data: createSiteOrderDto,
      // status по умолчанию "Новый" (из базы)
    });
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
        include: { city: { select: { id: true, name: true } } },
      }),
      this.prisma.siteOrder.count({ where }),
    ]);

    return {
      data,
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
      include: { city: { select: { id: true, name: true } } },
    });

    if (!siteOrder) {
      throw new NotFoundException(`Заявка с ID ${id} не найдена`);
    }

    return siteOrder;
  }

  async update(id: number, updateSiteOrderDto: UpdateSiteOrderDto) {
    // Проверяем существование
    await this.findOne(id);

    return this.prisma.siteOrder.update({
      where: { id },
      data: updateSiteOrderDto,
    });
  }

  async remove(id: number) {
    // Проверяем существование
    await this.findOne(id);

    return this.prisma.siteOrder.delete({
      where: { id },
    });
  }

  async updateStatus(id: number, status: string, callbackAt?: string) {
    await this.findOne(id);

    return this.prisma.siteOrder.update({
      where: { id },
      data: {
        status,
        callbackAt: status === 'Перезвонить' && callbackAt ? new Date(callbackAt) : null,
      },
    });
  }

  async linkToOrder(id: number, orderId: number) {
    // Проверяем существование заявки
    await this.findOne(id);

    return this.prisma.siteOrder.update({
      where: { id },
      data: { 
        orderId,
        status: 'Заказ создан',
      },
    });
  }
}
