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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.guard';

@Controller('site-orders')
@UseGuards(CookieJwtAuthGuard, RolesGuard)
export class SiteOrdersController {
  constructor(private readonly siteOrdersService: SiteOrdersService) {}

  @Post()
  @Roles('operator', 'admin')
  create(@Body() createSiteOrderDto: CreateSiteOrderDto) {
    return this.siteOrdersService.create(createSiteOrderDto);
  }

  @Get()
  @Roles('operator', 'admin')
  findAll(@Query() query: QuerySiteOrdersDto) {
    return this.siteOrdersService.findAll(query);
  }

  @Get(':id')
  @Roles('operator', 'admin')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.siteOrdersService.findOne(id);
  }

  @Patch(':id')
  @Roles('operator', 'admin')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSiteOrderDto: UpdateSiteOrderDto,
  ) {
    return this.siteOrdersService.update(id, updateSiteOrderDto);
  }

  @Patch(':id/status')
  @Roles('operator', 'admin')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.siteOrdersService.updateStatus(id, status);
  }

  @Patch(':id/link-order')
  @Roles('operator', 'admin')
  linkToOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.siteOrdersService.linkToOrder(id, orderId);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.siteOrdersService.remove(id);
  }
}
