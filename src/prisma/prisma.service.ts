import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  
  // ✅ ОПТИМИЗАЦИЯ: Метрики для мониторинга производительности
  private queryStats = {
    total: 0,
    slow: 0,
    failed: 0,
    totalDuration: 0,
  };

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
        { level: 'query', emit: 'event' }, // ✅ Включаем логирование запросов для мониторинга
      ],
    });

    if (needsParams) {
      this.logger.log('✅ Connection pool configured: limit=50, pool_timeout=20s, connect_timeout=10s');
    }

    // ✅ ОПТИМИЗАЦИЯ: Мониторинг медленных запросов через события
    this.$on('query' as never, (e: any) => {
      if (e.duration > 1000) { // > 1 секунды
        this.logger.warn(`🐌 SLOW QUERY (${e.duration}ms): ${e.query.substring(0, 100)}...`);
        if (isDevelopment && e.params) {
          this.logger.debug(`Params: ${e.params}`);
        }
      }
    });

    // ✅ Query Performance Monitoring с метриками
    this.$use(async (params, next) => {
      const before = Date.now();
      this.queryStats.total++;
      
      try {
        const result = await next(params);
        const duration = Date.now() - before;
        this.queryStats.totalDuration += duration;

        // Пороги для orders service (строже, чем для других)
        if (duration > 1000) {
          this.queryStats.slow++;
          this.logger.error(`🐌 SLOW QUERY: ${params.model}.${params.action} took ${duration}ms`);
        } else if (duration > 500) {
          this.queryStats.slow++;
          this.logger.warn(`⚠️ Slow query: ${params.model}.${params.action} took ${duration}ms`);
        } else if (isDevelopment && duration > 100) {
          this.logger.debug(`Query: ${params.model}.${params.action} took ${duration}ms`);
        }

        return result;
      } catch (error) {
        const duration = Date.now() - before;
        this.queryStats.failed++;
        this.queryStats.totalDuration += duration;
        this.logger.error(`❌ Query failed: ${params.model}.${params.action} after ${duration}ms`, error);
        throw error;
      }
    });

    // ✅ ОПТИМИЗАЦИЯ: Периодический вывод статистики (каждые 5 минут)
    setInterval(() => {
      if (this.queryStats.total > 0) {
        const avgDuration = (this.queryStats.totalDuration / this.queryStats.total).toFixed(2);
        const slowPercent = ((this.queryStats.slow / this.queryStats.total) * 100).toFixed(2);
        const failPercent = ((this.queryStats.failed / this.queryStats.total) * 100).toFixed(2);
        
        this.logger.log(`📊 DB Stats (last 5min): Total=${this.queryStats.total}, Avg=${avgDuration}ms, Slow=${slowPercent}%, Failed=${failPercent}%`);
        
        // Сброс счетчиков
        this.queryStats = { total: 0, slow: 0, failed: 0, totalDuration: 0 };
      }
    }, 300000); // 5 минут
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

  /**
   * ✅ ОПТИМИЗАЦИЯ: Получение метрик Connection Pool для мониторинга
   * Используется для Prometheus/Grafana или health checks
   */
  getPoolMetrics() {
    const avgDuration = this.queryStats.total > 0 
      ? (this.queryStats.totalDuration / this.queryStats.total).toFixed(2)
      : '0';
    
    const slowPercent = this.queryStats.total > 0
      ? ((this.queryStats.slow / this.queryStats.total) * 100).toFixed(2)
      : '0';
    
    const failPercent = this.queryStats.total > 0
      ? ((this.queryStats.failed / this.queryStats.total) * 100).toFixed(2)
      : '0';

    return {
      queries_total: this.queryStats.total,
      queries_slow: this.queryStats.slow,
      queries_failed: this.queryStats.failed,
      queries_avg_duration_ms: parseFloat(avgDuration),
      queries_slow_percent: parseFloat(slowPercent),
      queries_fail_percent: parseFloat(failPercent),
      connection_limit: 50,
      pool_timeout_sec: 20,
      connect_timeout_sec: 10,
    };
  }

  /**
   * ✅ ОПТИМИЗАЦИЯ: Health check для проверки подключения к БД
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error) {
      this.logger.error('Health check failed', error);
      return { healthy: false, latency: Date.now() - start };
    }
  }
}

