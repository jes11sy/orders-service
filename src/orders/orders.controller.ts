import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus, Logger, BadRequestException, Ip } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CookieJwtAuthGuard } from '../auth/guards/cookie-jwt-auth.guard';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
import { CreateOrderFromChatDto } from './dto/create-order-from-chat.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';
import { AuthUser } from '../types/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ✅ ИСПРАВЛЕНИЕ: Типизированный Request
interface AuthenticatedRequest {
  user: AuthUser;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private ordersService: OrdersService,
    private prismaService: PrismaService,
    private auditService: AuditService,
  ) {}

  @Get('health')
  @SkipThrottle() // ✅ Health checks не лимитируем
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check endpoint' })
  async health() {
    const dbHealth = await this.prismaService.healthCheck();
    
    return {
      success: true,
      message: 'Orders Service is healthy',
      timestamp: new Date().toISOString(),
      database: {
        healthy: dbHealth.healthy,
        latency_ms: dbHealth.latency,
      },
    };
  }

  @Get('metrics')
  @SkipThrottle() // ✅ Metrics не лимитируем
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get database connection pool metrics' })
  async metrics() {
    const poolMetrics = this.prismaService.getPoolMetrics();
    
    return {
      success: true,
      data: {
        service: 'orders-service',
        timestamp: new Date().toISOString(),
        database: poolMetrics,
      },
    };
  }

  // ✅ FIX: Статические роуты ПЕРЕД динамическими (:id)
  @Get('statuses')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available order statuses' })
  async getOrderStatuses() {
    return {
      success: true,
      data: [
        'Ожидает',
        'Принял', 
        'В пути',
        'В работе',
        'Готово',
        'Отказ',
        'Модерн',
        'Незаказ'
      ]
    };
  }

  @Get('filter-options')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get filter options (RKs, typeEquipments)' })
  async getFilterOptions(@Request() req: AuthenticatedRequest) {
    return this.ordersService.getFilterOptions(req.user);
  }

  @Get('by-phone/:phone')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Get orders by phone number' })
  async getOrdersByPhone(@Param('phone') phone: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.getOrdersByPhone(phone, req.user);
  }

  @Get()
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders with filters' })
  async getOrders(@Query() query: QueryOrdersDto, @Request() req: AuthenticatedRequest) {
    return this.ordersService.getOrders(query, req.user);
  }

  @Post()
  @Throttle({ short: { limit: 5, ttl: 1000 } }) // ✅ Строже: 5 заказов/сек
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR)
  @ApiOperation({ summary: 'Create new order' })
  async createOrder(@Body() dto: CreateOrderDto, @Request() req: AuthenticatedRequest, @Ip() ip: string) {
    // ✅ ИСПРАВЛЕНИЕ: Удалено логирование конфиденциальных данных
    this.logger.log(`Creating order for operator ${req.user.userId}`);
    try {
      const result = await this.ordersService.createOrder(dto, req.user);
      this.logger.log(`Order created successfully: #${result.data.id}`);
      
      // Логируем создание заказа
      const userAgent = req.headers['user-agent'] || 'Unknown';
      await this.auditService.logOrderCreate(
        result.data.id,
        req.user.userId,
        req.user.role,
        req.user.login,
        ip,
        userAgent as string,
        dto
      );
      
      return result;
    } catch (error) {
      this.logger.error(`Error creating order: ${error.message}`);
      throw new BadRequestException(`Failed to create order: ${error.message}`);
    }
  }

  @Post('from-call')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR)
  @ApiOperation({ summary: 'Create order from call' })
  async createOrderFromCall(@Body() dto: CreateOrderFromCallDto, @Request() req: AuthenticatedRequest, @Ip() ip: string) {
    const result = await this.ordersService.createOrderFromCall(dto, req.user);
    
    // Логируем создание заказа из звонка
    const userAgent = req.headers['user-agent'] || 'Unknown';
    await this.auditService.logOrderCreate(
      result.data.id,
      req.user.userId,
      req.user.role,
      req.user.login,
      ip,
      userAgent as string,
      dto
    );
    
    return result;
  }

  @Post('from-chat')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR)
  @ApiOperation({ summary: 'Create order from chat' })
  async createOrderFromChat(@Body() dto: CreateOrderFromChatDto, @Request() req: AuthenticatedRequest, @Ip() ip: string) {
    // ✅ ИСПРАВЛЕНИЕ: Удалено логирование конфиденциальных данных
    this.logger.log(`Creating order from chat for operator ${req.user.userId}`);
    try {
      const result = await this.ordersService.createOrderFromChat(dto, req.user);
      this.logger.log(`Order from chat created successfully: #${result.data.id}`);
      
      // Логируем создание заказа из чата
      const userAgent = req.headers['user-agent'] || 'Unknown';
      await this.auditService.logOrderCreate(
        result.data.id,
        req.user.userId,
        req.user.role,
        req.user.login,
        ip,
        userAgent as string,
        dto
      );
      
      return result;
    } catch (error) {
      this.logger.error(`Error creating order from chat: ${error.message}`);
      throw new BadRequestException(`Failed to create order from chat: ${error.message}`);
    }
  }

  @Get(':id/history')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order history (audit logs)' })
  async getOrderHistory(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.getOrderHistory(+id, req.user);
  }

  @Get(':id')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order by ID' })
  async getOrder(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.getOrder(+id, req.user);
  }

  @Put(':id')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR, UserRole.DIRECTOR, UserRole.MASTER)
  @ApiOperation({ summary: 'Update order (operator, director, master)' })
  async updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto, @Request() req: AuthenticatedRequest, @Ip() ip: string) {
    // ✅ FIX N+1: Используем oldOrder из результата updateOrder (уже возвращается из транзакции)
    const result = await this.ordersService.updateOrder(+id, dto, req.user, req.headers);
    
    // oldOrder возвращается вместе с результатом - НЕ делаем отдельный запрос!
    const oldOrder = result.oldOrder;
    
    // Логируем обновление или закрытие заказа
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    if (dto.statusOrder === 'Готово') {
      // Закрытие заказа
      await this.auditService.logOrderClose(
        +id,
        req.user.userId,
        req.user.role,
        req.user.login,
        ip,
        userAgent as string,
        result.data
      );
    } else {
      // Обычное обновление - сравниваем что изменилось
      const changes: any = {};
      
      // Сравниваем основные поля
      if (dto.statusOrder !== undefined && oldOrder?.statusOrder !== dto.statusOrder) {
        changes.statusOrder = { old: oldOrder?.statusOrder, new: dto.statusOrder };
      }
      if (dto.masterId !== undefined && oldOrder?.masterId !== dto.masterId) {
        changes.masterId = { old: oldOrder?.masterId, new: dto.masterId };
      }
      if (dto.address !== undefined && oldOrder?.address !== dto.address) {
        changes.address = { old: oldOrder?.address, new: dto.address };
      }
      if (dto.phone !== undefined && oldOrder?.phone !== dto.phone) {
        changes.phone = { old: oldOrder?.phone, new: dto.phone };
      }
      if (dto.clientName !== undefined && oldOrder?.clientName !== dto.clientName) {
        changes.clientName = { old: oldOrder?.clientName, new: dto.clientName };
      }
      if (dto.dateMeeting !== undefined) {
        const oldDate = oldOrder?.dateMeeting?.toISOString();
        const newDate = new Date(dto.dateMeeting).toISOString();
        if (oldDate !== newDate) {
          changes.dateMeeting = { old: oldDate, new: newDate };
        }
      }
      if (dto.problem !== undefined && oldOrder?.problem !== dto.problem) {
        changes.problem = { old: oldOrder?.problem, new: dto.problem };
      }
      
      await this.auditService.logOrderUpdate(
        +id,
        req.user.userId,
        req.user.role,
        req.user.login,
        ip,
        userAgent as string,
        changes
      );
    }
    
    return result;
  }

  @Patch(':id/status')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR, UserRole.DIRECTOR, UserRole.MASTER)
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: AuthenticatedRequest, @Ip() ip: string) {
    // ✅ FIX #35: Убран лишний запрос к БД - oldStatus возвращается из updateStatus
    const result = await this.ordersService.updateStatus(+id, status, req.user, req.headers);
    
    // Логируем изменение статуса
    if (result.oldStatus) {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      await this.auditService.logOrderStatusChange(
        +id,
        req.user.userId,
        req.user.role,
        req.user.login,
        ip,
        userAgent as string,
        result.oldStatus,
        status
      );
    }
    
    return result;
  }

  @Patch(':id/master')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Assign master to order' })
  async assignMaster(@Param('id') id: string, @Body('masterId') masterId: number) {
    return this.ordersService.assignMaster(+id, masterId);
  }

  @Get(':id/avito-chat')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Avito chat info for order' })
  async getOrderAvitoChat(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.getOrderAvitoChat(+id, req.user);
  }

  @Patch(':id/submit-cash')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.MASTER)
  @ApiOperation({ summary: 'Submit cash for review' })
  async submitCashForReview(
    @Param('id') id: string,
    @Body() body: { cashReceiptDoc?: string },
    @Request() req: AuthenticatedRequest
  ) {
    this.logger.log(`Master ${req.user.userId} submitting cash for order ${id}`);
    return this.ordersService.submitCashForReview(+id, body.cashReceiptDoc, req.user);
  }

}

