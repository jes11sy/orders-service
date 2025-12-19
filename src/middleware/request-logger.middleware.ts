import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Middleware для логирования всех входящих запросов (Fastify)
 * Помогает отследить какие endpoint'ы вызываются и сколько времени они занимают
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    const { method, url } = req;
    const ip = (req as any).ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const startTime = Date.now();

    // Логируем начало запроса
    this.logger.log(`→ ${method} ${url} [${ip}]`);

    // Перехватываем завершение ответа
    res.on('finish', () => {
      const statusCode = res.statusCode;
      const duration = Date.now() - startTime;
      
      // Логируем результат с цветовым кодированием
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';
      const emoji = statusCode >= 500 ? '🔴' : statusCode >= 400 ? '⚠️' : '✅';
      
      this.logger[logLevel](
        `${emoji} ${method} ${url} ${statusCode} - ${duration}ms`
      );

      // Предупреждение о медленных запросах (>3 секунды)
      if (duration > 3000) {
        this.logger.warn(`🐌 SLOW REQUEST: ${method} ${url} took ${duration}ms`);
      }

      // Критическое предупреждение о ОЧЕНЬ медленных запросах (>10 секунд)
      if (duration > 10000) {
        this.logger.error(`🚨 CRITICAL SLOW REQUEST: ${method} ${url} took ${duration}ms`);
      }
    });

    next();
  }
}

