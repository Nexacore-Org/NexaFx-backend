import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';
import { UserRole } from '../../users/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserPayload }>();
    const { user } = request;

    if (!user?.role) {
      return false;
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return requiredRoles.some(
        (role) => role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN,
      );
    }

    return requiredRoles.some((role) => user.role === role);
  }
}
