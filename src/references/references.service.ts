import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto, UpdateCityDto, QueryCityDto } from './dto/cities.dto';
import { CreateRkDto, UpdateRkDto, QueryRkDto } from './dto/rk.dto';
import { CreateOrderTypeDto, UpdateOrderTypeDto } from './dto/order-types.dto';
import { CreateEquipmentTypeDto, UpdateEquipmentTypeDto } from './dto/equipment-types.dto';
import { CreateOrderStatusDto, UpdateOrderStatusDto } from './dto/order-statuses.dto';

@Injectable()
export class ReferencesService {
  private readonly logger = new Logger(ReferencesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── ГОРОДА ───────────────────────────────────────────────

  async getCities(query: QueryCityDto) {
    const where: any = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const cities = await this.prisma.city.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return { success: true, data: cities };
  }

  async createCity(dto: CreateCityDto) {
    const existing = await this.prisma.city.findFirst({
      where: { OR: [{ name: dto.name }, { code: dto.code }] },
    });
    if (existing) {
      throw new ConflictException('Город с таким названием или кодом уже существует');
    }

    const city = await this.prisma.city.create({ data: dto });
    this.logger.log(`City created: ${city.name} (${city.code})`);
    return { success: true, data: city };
  }

  async updateCity(id: number, dto: UpdateCityDto) {
    await this.findCityOrFail(id);

    if (dto.name || dto.code) {
      const conflict = await this.prisma.city.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { OR: [...(dto.name ? [{ name: dto.name }] : []), ...(dto.code ? [{ code: dto.code }] : [])] },
          ],
        },
      });
      if (conflict) {
        throw new ConflictException('Город с таким названием или кодом уже существует');
      }
    }

    const city = await this.prisma.city.update({ where: { id }, data: dto });
    return { success: true, data: city };
  }

  async deleteCity(id: number) {
    await this.findCityOrFail(id);

    const ordersCount = await this.prisma.order.count({ where: { cityId: id } });
    if (ordersCount > 0) {
      throw new ConflictException(`Нельзя удалить город: к нему привязано ${ordersCount} заказов`);
    }

    await this.prisma.city.delete({ where: { id } });
    return { success: true, message: 'Город удалён' };
  }

  private async findCityOrFail(id: number) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException(`Город с ID ${id} не найден`);
    return city;
  }

  // ─── РЕКЛАМНЫЕ КАНАЛЫ (РК) ────────────────────────────────

  async getRkList(query: QueryRkDto) {
    const where: any = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const rks = await this.prisma.rk.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return { success: true, data: rks };
  }

  async createRk(dto: CreateRkDto) {
    const existing = await this.prisma.rk.findFirst({
      where: { OR: [{ name: dto.name }, { code: dto.code }] },
    });
    if (existing) {
      throw new ConflictException('РК с таким названием или кодом уже существует');
    }

    const rk = await this.prisma.rk.create({ data: dto });
    this.logger.log(`Rk created: ${rk.name} (${rk.code})`);
    return { success: true, data: rk };
  }

  async updateRk(id: number, dto: UpdateRkDto) {
    await this.findRkOrFail(id);

    if (dto.name || dto.code) {
      const conflict = await this.prisma.rk.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { OR: [...(dto.name ? [{ name: dto.name }] : []), ...(dto.code ? [{ code: dto.code }] : [])] },
          ],
        },
      });
      if (conflict) {
        throw new ConflictException('РК с таким названием или кодом уже существует');
      }
    }

    const rk = await this.prisma.rk.update({ where: { id }, data: dto });
    return { success: true, data: rk };
  }

  async deleteRk(id: number) {
    await this.findRkOrFail(id);

    const ordersCount = await this.prisma.order.count({ where: { rkId: id } });
    if (ordersCount > 0) {
      throw new ConflictException(`Нельзя удалить РК: к нему привязано ${ordersCount} заказов`);
    }

    await this.prisma.rk.delete({ where: { id } });
    return { success: true, message: 'РК удалён' };
  }

  private async findRkOrFail(id: number) {
    const rk = await this.prisma.rk.findUnique({ where: { id } });
    if (!rk) throw new NotFoundException(`РК с ID ${id} не найден`);
    return rk;
  }

  // ─── ТИПЫ ЗАКАЗОВ ─────────────────────────────────────────

  async getOrderTypes() {
    const orderTypes = await this.prisma.orderType.findMany({
      orderBy: { name: 'asc' },
    });
    return { success: true, data: orderTypes };
  }

  async createOrderType(dto: CreateOrderTypeDto) {
    const existing = await this.prisma.orderType.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Тип заказа с таким названием уже существует');
    }

    const orderType = await this.prisma.orderType.create({ data: dto });
    this.logger.log(`OrderType created: ${orderType.name}`);
    return { success: true, data: orderType };
  }

  async updateOrderType(id: number, dto: UpdateOrderTypeDto) {
    await this.findOrderTypeOrFail(id);

    if (dto.name) {
      const conflict = await this.prisma.orderType.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Тип заказа с таким названием уже существует');
    }

    const orderType = await this.prisma.orderType.update({ where: { id }, data: dto });
    return { success: true, data: orderType };
  }

  async deleteOrderType(id: number) {
    await this.findOrderTypeOrFail(id);

    const ordersCount = await this.prisma.order.count({ where: { orderTypeId: id } });
    if (ordersCount > 0) {
      throw new ConflictException(`Нельзя удалить тип заказа: к нему привязано ${ordersCount} заказов`);
    }

    await this.prisma.orderType.delete({ where: { id } });
    return { success: true, message: 'Тип заказа удалён' };
  }

  private async findOrderTypeOrFail(id: number) {
    const orderType = await this.prisma.orderType.findUnique({ where: { id } });
    if (!orderType) throw new NotFoundException(`Тип заказа с ID ${id} не найден`);
    return orderType;
  }

  // ─── ТИПЫ ОБОРУДОВАНИЯ ────────────────────────────────────

  async getEquipmentTypes() {
    const equipmentTypes = await this.prisma.equipmentType.findMany({
      orderBy: { name: 'asc' },
    });
    return { success: true, data: equipmentTypes };
  }

  async createEquipmentType(dto: CreateEquipmentTypeDto) {
    const existing = await this.prisma.equipmentType.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Тип оборудования с таким названием уже существует');
    }

    const equipmentType = await this.prisma.equipmentType.create({ data: dto });
    this.logger.log(`EquipmentType created: ${equipmentType.name}`);
    return { success: true, data: equipmentType };
  }

  async updateEquipmentType(id: number, dto: UpdateEquipmentTypeDto) {
    await this.findEquipmentTypeOrFail(id);

    if (dto.name) {
      const conflict = await this.prisma.equipmentType.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Тип оборудования с таким названием уже существует');
    }

    const equipmentType = await this.prisma.equipmentType.update({ where: { id }, data: dto });
    return { success: true, data: equipmentType };
  }

  async deleteEquipmentType(id: number) {
    await this.findEquipmentTypeOrFail(id);

    const ordersCount = await this.prisma.order.count({ where: { equipmentTypeId: id } });
    if (ordersCount > 0) {
      throw new ConflictException(`Нельзя удалить тип оборудования: к нему привязано ${ordersCount} заказов`);
    }

    await this.prisma.equipmentType.delete({ where: { id } });
    return { success: true, message: 'Тип оборудования удалён' };
  }

  private async findEquipmentTypeOrFail(id: number) {
    const equipmentType = await this.prisma.equipmentType.findUnique({ where: { id } });
    if (!equipmentType) throw new NotFoundException(`Тип оборудования с ID ${id} не найден`);
    return equipmentType;
  }

  // ─── СТАТУСЫ ЗАКАЗОВ ──────────────────────────────────────

  async getOrderStatuses() {
    const statuses = await this.prisma.orderStatus.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data: statuses };
  }

  async createOrderStatus(dto: CreateOrderStatusDto) {
    const existing = await this.prisma.orderStatus.findFirst({
      where: { OR: [{ name: dto.name }, { code: dto.code }] },
    });
    if (existing) {
      throw new ConflictException('Статус заказа с таким названием или кодом уже существует');
    }

    const status = await this.prisma.orderStatus.create({ data: dto });
    this.logger.log(`OrderStatus created: ${status.name} (${status.code})`);
    return { success: true, data: status };
  }

  async updateOrderStatus(id: number, dto: UpdateOrderStatusDto) {
    await this.findOrderStatusOrFail(id);

    if (dto.name || dto.code) {
      const conflict = await this.prisma.orderStatus.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { OR: [...(dto.name ? [{ name: dto.name }] : []), ...(dto.code ? [{ code: dto.code }] : [])] },
          ],
        },
      });
      if (conflict) throw new ConflictException('Статус заказа с таким названием или кодом уже существует');
    }

    const status = await this.prisma.orderStatus.update({ where: { id }, data: dto });
    return { success: true, data: status };
  }

  async deleteOrderStatus(id: number) {
    await this.findOrderStatusOrFail(id);

    const ordersCount = await this.prisma.order.count({ where: { statusId: id } });
    if (ordersCount > 0) {
      throw new ConflictException(`Нельзя удалить статус: к нему привязано ${ordersCount} заказов`);
    }

    await this.prisma.orderStatus.delete({ where: { id } });
    return { success: true, message: 'Статус заказа удалён' };
  }

  private async findOrderStatusOrFail(id: number) {
    const status = await this.prisma.orderStatus.findUnique({ where: { id } });
    if (!status) throw new NotFoundException(`Статус заказа с ID ${id} не найден`);
    return status;
  }
}
