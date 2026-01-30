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

  // ✅ FIX: Интервал для keepalive пинга
  private keepAliveInterval: NodeJS.Timeout | null = null;
  // ✅ FIX: Интервал для статистики (предотвращение memory leak)
  private statsInterval: NodeJS.Timeout | null = null;
  private isReconnecting = false;

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
      // ✅ FIX: TCP Keepalive для предотвращения idle-session timeout
      'keepalives=1',             // Включить TCP keepalive
      'keepalives_idle=30',       // Начать keepalive через 30 секунд простоя
      'keepalives_interval=10',   // Интервал между keepalive пакетами: 10s
      'keepalives_count=3',       // Количество попыток перед разрывом
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
      // Таймаут транзакций по умолчанию (можно переопределить в $transaction)
      transactionOptions: {
        maxWait: 10000,   // Максимальное ожидание начала транзакции: 10s
        timeout: 30000,   // Таймаут выполнения транзакции: 30s
      },
    });

    if (needsParams) {
      this.logger.log('✅ Connection pool configured: limit=50, pool_timeout=20s, connect_timeout=10s, keepalive=30s');
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
      } catch (error: any) {
        const duration = Date.now() - before;
        this.queryStats.failed++;
        this.queryStats.totalDuration += duration;
        
        // ✅ FIX: Обработка ошибки idle-session timeout (код 57P05)
        const errorMessage = error?.message || '';
        const isIdleTimeout = errorMessage.includes('idle-session timeout') || 
                              errorMessage.includes('57P05') ||
                              errorMessage.includes('terminating connection');
        
        if (isIdleTimeout) {
          this.logger.warn(`⚠️ Idle-session timeout detected, triggering reconnection...`);
          // Асинхронно запускаем переподключение
          this.handleConnectionError().catch(() => {});
        }
        
        this.logger.error(`❌ Query failed: ${params.model}.${params.action} after ${duration}ms`, error);
        throw error;
      }
    });

    // ✅ ОПТИМИЗАЦИЯ: Периодический вывод статистики (каждые 5 минут)
    // ✅ FIX: Присваиваем интервал переменной для очистки при destroy
    this.statsInterval = setInterval(() => {
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
      
      // ✅ FIX: Запуск keepalive пинга каждые 60 секунд
      // Это предотвращает закрытие idle соединений PostgreSQL
      this.startKeepAlive();
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    // ✅ FIX: Остановить все интервалы для предотвращения memory leak
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    await this.$disconnect();
    this.logger.log('✅ Database disconnected');
  }

  /**
   * ✅ FIX: Периодический keepalive для предотвращения idle-session timeout
   * PostgreSQL/прокси могут закрывать соединения после idle timeout
   * Этот пинг держит соединения активными
   */
  private startKeepAlive() {
    // ✅ FIX: Пинг каждые 20 секунд (агрессивнее, для cloud/proxy окружений)
    // Многие cloud PostgreSQL (Neon, Supabase, managed PostgreSQL) имеют короткий idle timeout
    this.keepAliveInterval = setInterval(async () => {
      try {
        await this.$queryRaw`SELECT 1`;
        // Не логируем успешные пинги чтобы не засорять логи
      } catch (error: any) {
        this.logger.warn(`⚠️ Keepalive ping failed: ${error?.message || 'Unknown error'}`);
        // Попытка переподключения
        await this.handleConnectionError();
      }
    }, 20000); // 20 секунд (было 60)
    
    this.logger.log('✅ Keepalive started (interval: 20s)');
  }

  /**
   * ✅ FIX: Проверка соединения перед тяжёлым запросом
   * Возвращает true если соединение живое, false если нужен reconnect
   */
  async ensureConnection(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error: any) {
      this.logger.warn(`⚠️ Connection check failed, reconnecting...`);
      await this.handleConnectionError();
      return false;
    }
  }

  /**
   * ✅ FIX: Обработка ошибки подключения с автоматическим переподключением
   */
  private async handleConnectionError() {
    if (this.isReconnecting) {
      return; // Уже идёт переподключение
    }
    
    this.isReconnecting = true;
    this.logger.warn('🔄 Attempting to reconnect to database...');
    
    try {
      // Отключаемся (очищаем мёртвые соединения)
      await this.$disconnect();
      // Небольшая пауза
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Переподключаемся
      await this.$connect();
      this.logger.log('✅ Database reconnected successfully');
    } catch (error: any) {
      this.logger.error(`❌ Reconnection failed: ${error?.message || 'Unknown error'}`);
      // Повторная попытка через 5 секунд
      setTimeout(() => {
        this.isReconnecting = false;
        this.handleConnectionError();
      }, 5000);
      return;
    }
    
    this.isReconnecting = false;
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
      keepalive_active: this.keepAliveInterval !== null,
      is_reconnecting: this.isReconnecting,
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

