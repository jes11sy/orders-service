import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
    // ✅ FIX: Rate limiting для защиты от DDoS/брутфорса
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,    // 1 секунда
        limit: 10,    // 10 запросов в секунду
      },
      {
        name: 'medium',
        ttl: 10000,   // 10 секунд
        limit: 50,    // 50 запросов за 10 секунд
      },
      {
        name: 'long',
        ttl: 60000,   // 1 минута
        limit: 200,   // 200 запросов в минуту
      },
    ]),
    PrismaModule,
    AuthModule,
    OrdersModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [
    // ✅ FIX: Глобальный rate limiter
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Применяем логирование ко всем роутам кроме /health и /metrics
    consumer
      .apply(RequestLoggerMiddleware)
      .exclude('orders/health', 'orders/metrics', 'metrics')
      .forRoutes('*');
  }
}

