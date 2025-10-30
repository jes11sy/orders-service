import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  const logger = new Logger('OrdersService');

  // ✅ ИСПРАВЛЕНИЕ: CORS с безопасным fallback
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:3000'];
  await app.register(require('@fastify/cors'), {
    origin: allowedOrigins,
    credentials: true,
  });
  logger.log(`CORS enabled for: ${allowedOrigins.join(', ')}`);

  // ✅ ИСПРАВЛЕНИЕ: Включен Content Security Policy
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });
  logger.log('Security headers (CSP) enabled');

  // ✅ ИСПРАВЛЕНИЕ: Улучшенная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // ✅ Отклоняет неизвестные поля
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // ✅ ИСПРАВЛЕНИЕ: Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger только для development
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Orders Service API')
      .setDescription('Orders management microservice')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger UI enabled at /api/docs');
  }

  app.setGlobalPrefix('api/v1');

  // ✅ ИСПРАВЛЕНИЕ: Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 5002;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Orders Service running on http://localhost:${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // ✅ ИСПРАВЛЕНИЕ: Обработка сигналов для graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, closing application...');
    await app.close();
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, closing application...');
    await app.close();
  });
}

bootstrap();

