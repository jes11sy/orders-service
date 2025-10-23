import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderFromCallDto } from './dto/create-order-from-call.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
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
    return this.ordersService.createOrder(dto, req.user);
  }

  @Post('from-call')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Create order from call' })
  async createOrderFromCall(@Body() dto: CreateOrderFromCallDto, @Request() req) {
    return this.ordersService.createOrderFromCall(dto, req.user);
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
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Update order (operator only)' })
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

  @Patch(':id/approve')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.director)
  @ApiOperation({ summary: 'Approve order finances' })
  async approveFinances(@Param('id') id: string, @Request() req) {
    return this.ordersService.approveFinances(+id, req.user.userId);
  }
}

