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
    const { status, city, search, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (city) {
      where.city = city;
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

  async updateStatus(id: number, status: string) {
    // Проверяем существование
    await this.findOne(id);

    return this.prisma.siteOrder.update({
      where: { id },
      data: { status },
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
