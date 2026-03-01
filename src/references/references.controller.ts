import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReferencesService } from './references.service';
import { CookieJwtAuthGuard } from '../auth/guards/cookie-jwt-auth.guard';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';
import { CreateCityDto, UpdateCityDto, QueryCityDto } from './dto/cities.dto';
import { CreateRkDto, UpdateRkDto, QueryRkDto } from './dto/rk.dto';
import { CreateOrderTypeDto, UpdateOrderTypeDto } from './dto/order-types.dto';
import { CreateEquipmentTypeDto, UpdateEquipmentTypeDto } from './dto/equipment-types.dto';
import { CreateOrderStatusDto, UpdateOrderStatusDto } from './dto/order-statuses.dto';

@ApiTags('references')
@ApiBearerAuth()
@UseGuards(CookieJwtAuthGuard, RolesGuard)
@Controller('references')
export class ReferencesController {
  constructor(private readonly referencesService: ReferencesService) {}

  // ─── ГОРОДА ───────────────────────────────────────────────

  @Get('cities')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить список городов' })
  getCities(@Query() query: QueryCityDto) {
    return this.referencesService.getCities(query);
  }

  @Post('cities')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Создать город' })
  createCity(@Body() dto: CreateCityDto) {
    return this.referencesService.createCity(dto);
  }

  @Put('cities/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Обновить город' })
  updateCity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCityDto,
  ) {
    return this.referencesService.updateCity(id, dto);
  }

  @Delete('cities/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить город' })
  deleteCity(@Param('id', ParseIntPipe) id: number) {
    return this.referencesService.deleteCity(id);
  }

  // ─── РЕКЛАМНЫЕ КАНАЛЫ (РК) ────────────────────────────────

  @Get('rk')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить список рекламных каналов' })
  getRkList(@Query() query: QueryRkDto) {
    return this.referencesService.getRkList(query);
  }

  @Post('rk')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Создать рекламный канал' })
  createRk(@Body() dto: CreateRkDto) {
    return this.referencesService.createRk(dto);
  }

  @Put('rk/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Обновить рекламный канал' })
  updateRk(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRkDto,
  ) {
    return this.referencesService.updateRk(id, dto);
  }

  @Delete('rk/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить рекламный канал' })
  deleteRk(@Param('id', ParseIntPipe) id: number) {
    return this.referencesService.deleteRk(id);
  }

  // ─── ТИПЫ ЗАКАЗОВ ─────────────────────────────────────────

  @Get('order-types')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить список типов заказов' })
  getOrderTypes() {
    return this.referencesService.getOrderTypes();
  }

  @Post('order-types')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Создать тип заказа' })
  createOrderType(@Body() dto: CreateOrderTypeDto) {
    return this.referencesService.createOrderType(dto);
  }

  @Put('order-types/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Обновить тип заказа' })
  updateOrderType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderTypeDto,
  ) {
    return this.referencesService.updateOrderType(id, dto);
  }

  @Delete('order-types/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить тип заказа' })
  deleteOrderType(@Param('id', ParseIntPipe) id: number) {
    return this.referencesService.deleteOrderType(id);
  }

  // ─── ТИПЫ ОБОРУДОВАНИЯ ────────────────────────────────────

  @Get('equipment-types')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить список типов оборудования' })
  getEquipmentTypes() {
    return this.referencesService.getEquipmentTypes();
  }

  @Post('equipment-types')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Создать тип оборудования' })
  createEquipmentType(@Body() dto: CreateEquipmentTypeDto) {
    return this.referencesService.createEquipmentType(dto);
  }

  @Put('equipment-types/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Обновить тип оборудования' })
  updateEquipmentType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentTypeDto,
  ) {
    return this.referencesService.updateEquipmentType(id, dto);
  }

  @Delete('equipment-types/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить тип оборудования' })
  deleteEquipmentType(@Param('id', ParseIntPipe) id: number) {
    return this.referencesService.deleteEquipmentType(id);
  }

  // ─── СТАТУСЫ ЗАКАЗОВ ──────────────────────────────────────

  @Get('order-statuses')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Получить список статусов заказов' })
  getOrderStatuses() {
    return this.referencesService.getOrderStatuses();
  }

  @Post('order-statuses')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Создать статус заказа' })
  createOrderStatus(@Body() dto: CreateOrderStatusDto) {
    return this.referencesService.createOrderStatus(dto);
  }

  @Put('order-statuses/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Обновить статус заказа' })
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.referencesService.updateOrderStatus(id, dto);
  }

  @Delete('order-statuses/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить статус заказа' })
  deleteOrderStatus(@Param('id', ParseIntPipe) id: number) {
    return this.referencesService.deleteOrderStatus(id);
  }
}
