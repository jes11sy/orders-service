import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // ✅ ОПТИМИЗИРОВАНО: Orders Service - основной сервис с высокой нагрузкой
    // Connection pool: 50 соединений для обработки множества параллельных запросов
    const databaseUrl = process.env.DATABASE_URL || '';
    const hasParams = databaseUrl.includes('?');
    
    const connectionParams = [
      'connection_limit=50',      // Высокое значение для основного сервиса
      'pool_timeout=20',          // Таймаут получения соединения: 20s
      'connect_timeout=10',       // Таймаут подключения к БД: 10s
      'socket_timeout=60',        // Таймаут socket: 60s
    ];
    
    // Проверяем наличие параметров в URL
    const needsParams = !databaseUrl.includes('connection_limit');
    const enhancedUrl = needsParams
      ? `${databaseUrl}${hasParams ? '&' : '?'}${connectionParams.join('&')}`
      : databaseUrl;

    super({
      datasources: {
        db: {
          url: enhancedUrl,
        },
      },
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });

    if (needsParams) {
      this.logger.log('✅ Connection pool configured: limit=50, pool_timeout=20s, connect_timeout=10s');
    }

    // ✅ Query Performance Monitoring (включено всегда для критического сервиса)
    this.$use(async (params, next) => {
      const before = Date.now();
      
      try {
        const result = await next(params);
        const duration = Date.now() - before;

        // Пороги для orders service (строже, чем для других)
        if (duration > 1000) {
          this.logger.error(`🐌 SLOW QUERY: ${params.model}.${params.action} took ${duration}ms`);
        } else if (duration > 500) {
          this.logger.warn(`⚠️ Slow query: ${params.model}.${params.action} took ${duration}ms`);
        } else if (isDevelopment && duration > 100) {
          this.logger.debug(`Query: ${params.model}.${params.action} took ${duration}ms`);
        }

        return result;
      } catch (error) {
        const duration = Date.now() - before;
        this.logger.error(`❌ Query failed: ${params.model}.${params.action} after ${duration}ms`, error);
        throw error;
      }
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
      this.logger.log('✅ Orders Service ready (high-load configuration)');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('✅ Database disconnected');
  }
}

