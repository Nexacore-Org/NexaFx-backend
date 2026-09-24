import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      (UserRole | string)[]
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = this.getRequest(context);
    const user = request?.user;

    if (!user || !user.role) {
      throw new ForbiddenException(
        'User is not authenticated or role is missing',
      );
    }

    let hasRole = false;
    if (user.role === UserRole.SUPER_ADMIN) {
      hasRole = requiredRoles.some(
        (role) => role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN,
      );
    } else {
      hasRole = requiredRoles.some((role) => user.role === role);
    }

    if (!hasRole) {
      throw new ForbiddenException(
        'You do not have the required role to access this resource',
      );
    }

    return true;
  }

  private getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
