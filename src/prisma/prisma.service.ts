import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
      // ✅ ИСПРАВЛЕНИЕ: Connection pool настройки через DATABASE_URL
      // Формат: postgresql://user:password@host:5432/db?connection_limit=20&pool_timeout=20
    });

    // ✅ ИСПРАВЛЕНИЕ: Мониторинг медленных запросов (только в dev)
    if (process.env.NODE_ENV !== 'production') {
      this.$use(async (params, next) => {
        const before = Date.now();
        const result = await next(params);
        const after = Date.now();
        const duration = after - before;

        if (duration > 1000) {
          this.logger.warn(`⚠️ Slow query detected: ${params.model}.${params.action} took ${duration}ms`);
        } else if (duration > 100) {
          this.logger.debug(`Query: ${params.model}.${params.action} took ${duration}ms`);
        }

        return result;
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Database connected');
    this.logger.log(`Connection pool configured via DATABASE_URL`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('✅ Database disconnected');
  }
}

