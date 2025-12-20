import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CookieConfig } from '../../config/cookie.config';
import { FastifyRequest } from 'fastify';

/**
 * 🍪 COOKIE JWT AUTH GUARD
 * 
 * Guard для извлечения JWT токенов из httpOnly cookies
 * Если токен найден в cookie, он добавляется в Authorization header
 * для дальнейшей обработки стандартным JwtStrategy
 */
@Injectable()
export class CookieJwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(CookieJwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    
    // Пытаемся получить токен из cookies
    let cookieToken: string | null = null;
    
    // Проверяем наличие cookies в request
    const cookies = (request as any).cookies || (request.raw as any)?.cookies || null;
    
    if (cookies) {
      const rawCookie = cookies[CookieConfig.ACCESS_TOKEN_NAME];
      if (rawCookie && rawCookie.startsWith('eyJ')) {
        // ✅ JWT токен найден
        const parts = rawCookie.split('.');
        
        if (parts.length === 3) {
          // Стандартный JWT (header.payload.signature)
          cookieToken = rawCookie;
        } else if (parts.length === 4) {
          // JWT + старая подпись cookie (миграция с signed cookies)
          // Берём только первые 3 части
          this.logger.debug('🔧 Stripping legacy cookie signature (4 parts → 3)');
          cookieToken = parts.slice(0, 3).join('.');
        }
      }
    }
    
    // Если токен найден в cookie и нет Authorization header, добавляем его
    if (cookieToken && !request.headers.authorization) {
      request.headers.authorization = `Bearer ${cookieToken}`;
      this.logger.debug('✅ Token extracted from httpOnly cookie');
    }
    
    // Вызываем стандартную JWT валидацию
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Access token has expired. Please refresh your token.');
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid access token.');
      }
      throw err || new UnauthorizedException('Authentication required.');
    }
    return user;
  }
}

