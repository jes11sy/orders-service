import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
  ) {}

  @Get('health')
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

  @Get()
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders with filters' })
  async getOrders(@Query() query: QueryOrdersDto, @Request() req: AuthenticatedRequest) {
    return this.ordersService.getOrders(query, req.user);
  }

  @Post()
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create new order' })
  async createOrder(@Body() dto: CreateOrderDto, @Request() req: AuthenticatedRequest) {
    // ✅ ИСПРАВЛЕНИЕ: Удалено логирование конфиденциальных данных
    this.logger.log(`Creating order for operator ${req.user.userId}`);
    try {
      const result = await this.ordersService.createOrder(dto, req.user);
      this.logger.log(`Order created successfully: #${result.data.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error creating order: ${error.message}`);
      throw new BadRequestException(`Failed to create order: ${error.message}`);
    }
  }

  @Post('from-call')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create order from call' })
  async createOrderFromCall(@Body() dto: CreateOrderFromCallDto, @Request() req: AuthenticatedRequest) {
    return this.ordersService.createOrderFromCall(dto, req.user);
  }

  @Post('from-chat')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create order from chat' })
  async createOrderFromChat(@Body() dto: CreateOrderFromChatDto, @Request() req: AuthenticatedRequest) {
    // ✅ ИСПРАВЛЕНИЕ: Удалено логирование конфиденциальных данных
    this.logger.log(`Creating order from chat for operator ${req.user.userId}`);
    try {
      const result = await this.ordersService.createOrderFromChat(dto, req.user);
      this.logger.log(`Order from chat created successfully: #${result.data.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error creating order from chat: ${error.message}`);
      throw new BadRequestException(`Failed to create order from chat: ${error.message}`);
    }
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
  @Roles(UserRole.operator, UserRole.director, UserRole.master)
  @ApiOperation({ summary: 'Update order (operator, director, master)' })
  async updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto, @Request() req: AuthenticatedRequest) {
    return this.ordersService.updateOrder(+id, dto, req.user, req.headers);
  }

  @Patch(':id/status')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.director, UserRole.master)
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: AuthenticatedRequest) {
    return this.ordersService.updateStatus(+id, status, req.user, req.headers);
  }

  @Patch(':id/master')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.director)
  @ApiOperation({ summary: 'Assign master to order' })
  async assignMaster(@Param('id') id: string, @Body('masterId') masterId: number) {
    return this.ordersService.assignMaster(+id, masterId);
  }

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
  @Roles(UserRole.master)
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

