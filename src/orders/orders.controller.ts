import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
import { CreateOrderFromChatDto } from './dto/create-order-from-chat.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private ordersService: OrdersService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check endpoint' })
  async health() {
    return {
      success: true,
      message: 'Orders Service is healthy',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders with filters' })
  async getOrders(@Query() query: any, @Request() req) {
    return this.ordersService.getOrders(query, req.user);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create new order' })
  async createOrder(@Body() dto: CreateOrderDto, @Request() req) {
    this.logger.log('Creating order with data:', JSON.stringify(dto));
    try {
      const result = await this.ordersService.createOrder(dto, req.user);
      this.logger.log('Order created successfully:', result.data.id);
      return result;
    } catch (error) {
      this.logger.error('Error creating order:', error.message);
      throw new BadRequestException(`Failed to create order: ${error.message}`);
    }
  }

  @Post('from-call')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create order from call' })
  async createOrderFromCall(@Body() dto: CreateOrderFromCallDto, @Request() req) {
    return this.ordersService.createOrderFromCall(dto, req.user);
  }

  @Post('from-chat')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create order from chat' })
  async createOrderFromChat(@Body() dto: CreateOrderFromChatDto, @Request() req) {
    this.logger.log('Creating order from chat with data:', JSON.stringify(dto));
    try {
      const result = await this.ordersService.createOrderFromChat(dto, req.user);
      this.logger.log('Order from chat created successfully:', result.data.id);
      return result;
    } catch (error) {
      this.logger.error('Error creating order from chat:', error.message);
      throw new BadRequestException(`Failed to create order from chat: ${error.message}`);
    }
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order by ID' })
  async getOrder(@Param('id') id: string, @Request() req) {
    return this.ordersService.getOrder(+id, req.user);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.director)
  @ApiOperation({ summary: 'Update order (operator and director only)' })
  async updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto, @Request() req) {
    return this.ordersService.updateOrder(+id, dto, req.user);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.director, UserRole.master)
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req) {
    return this.ordersService.updateStatus(+id, status, req.user);
  }

  @Patch(':id/master')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.director)
  @ApiOperation({ summary: 'Assign master to order' })
  async assignMaster(@Param('id') id: string, @Body('masterId') masterId: number) {
    return this.ordersService.assignMaster(+id, masterId);
  }

  @Get('statuses')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
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

}

