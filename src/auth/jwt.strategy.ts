import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../types/auth-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    // ✅ ИСПРАВЛЕНИЕ: Валидация JWT_SECRET
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('❌ CRITICAL: JWT_SECRET is not defined in environment variables');
    }
    if (jwtSecret.length < 32) {
      throw new Error('❌ CRITICAL: JWT_SECRET must be at least 32 characters long');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
      ignoreExpiration: false, // ✅ Важно: проверяем expiration
    });
  }

  async validate(payload: any): Promise<AuthUser> {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException('Invalid token payload');
    }
    
    // ✅ ИСПРАВЛЕНИЕ: Строгая типизация вместо any
    return {
      sub: payload.sub,
      userId: payload.sub,
      login: payload.login,
      role: payload.role,
      name: payload.name,
      cities: payload.cities,
    };
  }
}

