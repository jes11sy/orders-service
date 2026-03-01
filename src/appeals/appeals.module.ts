import { Module } from '@nestjs/common';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppealsController],
  providers: [AppealsService],
  exports: [AppealsService],
})
export class AppealsModule {}
