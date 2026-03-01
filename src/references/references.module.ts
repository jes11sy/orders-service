import { Module } from '@nestjs/common';
import { ReferencesController } from './references.controller';
import { ReferencesService } from './references.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReferencesController],
  providers: [ReferencesService],
  exports: [ReferencesService],
})
export class ReferencesModule {}
