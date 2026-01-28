import { Module } from '@nestjs/common';
import { SiteOrdersService } from './site-orders.service';
import { SiteOrdersController } from './site-orders.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SiteOrdersController],
  providers: [SiteOrdersService],
  exports: [SiteOrdersService],
})
export class SiteOrdersModule {}
