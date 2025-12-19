import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware для логирования всех входящих запросов
 * Помогает отследить какие endpoint'ы вызываются и сколько времени они занимают
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    // Логируем начало запроса
    this.logger.log(`→ ${method} ${originalUrl} [${ip}]`);

    // Перехватываем завершение ответа
    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      
      // Логируем результат с цветовым кодированием
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';
      const emoji = statusCode >= 500 ? '🔴' : statusCode >= 400 ? '⚠️' : '✅';
      
      this.logger[logLevel](
        `${emoji} ${method} ${originalUrl} ${statusCode} - ${duration}ms`
      );

      // Предупреждение о медленных запросах (>3 секунды)
      if (duration > 3000) {
        this.logger.warn(`🐌 SLOW REQUEST: ${method} ${originalUrl} took ${duration}ms`);
      }

      // Критическое предупреждение о ОЧЕНЬ медленных запросах (>10 секунд)
      if (duration > 10000) {
        this.logger.error(`🚨 CRITICAL SLOW REQUEST: ${method} ${originalUrl} took ${duration}ms`);
      }
    });

    next();
  }
}

