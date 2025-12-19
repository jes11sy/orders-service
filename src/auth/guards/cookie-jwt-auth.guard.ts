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
    
    // Проверяем наличие cookies в request (NestJS abstraction)
    const cookiesSource = (request as any).cookies || (request.raw as any)?.cookies || null;
    const unsignCookieFn = (request as any).unsignCookie || (request.raw as any)?.unsignCookie || null;
    
    if (cookiesSource && CookieConfig.ENABLE_COOKIE_SIGNING && unsignCookieFn) {
      // Пытаемся получить подписанный cookie
      const signedCookie = cookiesSource[CookieConfig.ACCESS_TOKEN_NAME];
      if (signedCookie) {
        const unsigned = unsignCookieFn(signedCookie, CookieConfig.COOKIE_SECRET);
        cookieToken = unsigned?.valid ? unsigned.value : null;
        
        if (unsigned && !unsigned.valid) {
          this.logger.warn('⚠️ Invalid access token signature. Possible tampering.');
          throw new UnauthorizedException('Invalid access token signature. Possible tampering.');
        }
      }
    } else if (cookiesSource) {
      // Неподписанный cookie
      cookieToken = cookiesSource[CookieConfig.ACCESS_TOKEN_NAME];
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

