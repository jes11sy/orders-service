import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';

@ApiTags('orders')
@Controller('orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders with filters' })
  async getOrders(@Query() query: any, @Request() req) {
    return this.ordersService.getOrders(query, req.user);
  }

  @Post()
  @Roles(UserRole.CALLCENTRE_ADMIN, UserRole.CALLCENTRE_OPERATOR)
  @ApiOperation({ summary: 'Create new order' })
  async createOrder(@Body() dto: CreateOrderDto, @Request() req) {
    return this.ordersService.createOrder(dto, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  async getOrder(@Param('id') id: string, @Request() req) {
    return this.ordersService.getOrder(+id, req.user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update order' })
  async updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto, @Request() req) {
    return this.ordersService.updateOrder(+id, dto, req.user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req) {
    return this.ordersService.updateStatus(+id, status, req.user);
  }

  @Patch(':id/master')
  @Roles(UserRole.DIRECTOR, UserRole.CALLCENTRE_ADMIN)
  @ApiOperation({ summary: 'Assign master to order' })
  async assignMaster(@Param('id') id: string, @Body('masterId') masterId: number) {
    return this.ordersService.assignMaster(+id, masterId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Approve order finances' })
  async approveFinances(@Param('id') id: string, @Request() req) {
    return this.ordersService.approveFinances(+id, req.user.userId);
  }
}

