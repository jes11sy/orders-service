import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// ✅ FIX #83: Унифицированный enum ролей
export enum UserRole {
  ADMIN = 'admin',
  MASTER = 'master',
  DIRECTOR = 'director',
  CALLCENTRE_ADMIN = 'callcentre_admin',
  CALLCENTRE_OPERATOR = 'callcentre_operator',
  OPERATOR = 'operator',
}

export const Roles = (...roles: UserRole[]) => {
  return (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata('roles', roles, descriptor?.value || target);
    return descriptor || target;
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return roles.includes(user?.role);
  }
}

