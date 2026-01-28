import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { SiteOrdersService } from './site-orders.service';
import { CreateSiteOrderDto, UpdateSiteOrderDto, QuerySiteOrdersDto } from './dto';
import { CookieJwtAuthGuard } from '../auth/guards/cookie-jwt-auth.guard';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';

@Controller('site-orders')
export class SiteOrdersController {
  constructor(private readonly siteOrdersService: SiteOrdersService) {}

  /**
   * Внутренний эндпоинт для создания заявок из telegram (без JWT авторизации)
   * Защищён токеном WEBHOOK_TOKEN
   */
  @Post('internal')
  async createInternal(
    @Body() createSiteOrderDto: CreateSiteOrderDto,
    @Headers('x-webhook-token') webhookToken: string,
  ) {
    const expectedToken = process.env.WEBHOOK_TOKEN || process.env.NOTIFICATIONS_WEBHOOK_TOKEN;
    
    if (!webhookToken || webhookToken !== expectedToken) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    return this.siteOrdersService.create(createSiteOrderDto);
  }

  @Post()
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  create(@Body() createSiteOrderDto: CreateSiteOrderDto) {
    return this.siteOrdersService.create(createSiteOrderDto);
  }

  @Get()
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  findAll(@Query() query: QuerySiteOrdersDto) {
    return this.siteOrdersService.findAll(query);
  }

  @Get(':id')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.siteOrdersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSiteOrderDto: UpdateSiteOrderDto,
  ) {
    return this.siteOrdersService.update(id, updateSiteOrderDto);
  }

  @Patch(':id/status')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.siteOrdersService.updateStatus(id, status);
  }

  @Patch(':id/link-order')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  linkToOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.siteOrdersService.linkToOrder(id, orderId);
  }

  @Delete(':id')
  @UseGuards(CookieJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.siteOrdersService.remove(id);
  }
}
