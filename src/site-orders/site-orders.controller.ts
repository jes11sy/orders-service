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
} from '@nestjs/common';
import { SiteOrdersService } from './site-orders.service';
import { CreateSiteOrderDto, UpdateSiteOrderDto, QuerySiteOrdersDto } from './dto';
import { CookieJwtAuthGuard } from '../auth/guards/cookie-jwt-auth.guard';
import { RolesGuard, Roles, UserRole } from '../auth/roles.guard';

@Controller('site-orders')
@UseGuards(CookieJwtAuthGuard, RolesGuard)
export class SiteOrdersController {
  constructor(private readonly siteOrdersService: SiteOrdersService) {}

  @Post()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  create(@Body() createSiteOrderDto: CreateSiteOrderDto) {
    return this.siteOrdersService.create(createSiteOrderDto);
  }

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  findAll(@Query() query: QuerySiteOrdersDto) {
    return this.siteOrdersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.siteOrdersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSiteOrderDto: UpdateSiteOrderDto,
  ) {
    return this.siteOrdersService.update(id, updateSiteOrderDto);
  }

  @Patch(':id/status')
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.siteOrdersService.updateStatus(id, status);
  }

  @Patch(':id/link-order')
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
  linkToOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.siteOrdersService.linkToOrder(id, orderId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.siteOrdersService.remove(id);
  }
}
