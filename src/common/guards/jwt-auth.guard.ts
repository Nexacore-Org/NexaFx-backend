import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const ok = await super.canActivate(context);
    if (!ok) return false;

    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: { authStage?: string };
    }>();

    if (req.user?.authStage === 'partial_auth') {
      const method = (req.method ?? '').toUpperCase();
      const url = req.originalUrl ?? req.url ?? '';
      const path = url.split('?')[0];

      const allowed = method === 'POST' && path === '/two-factor/verify';

      if (!allowed) {
        throw new ForbiddenException(
          'Two-factor verification required to access this resource',
        );
      }
    }

    return true;
  }

  getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext<{
        req: Express.Request;
      }>().req;
    }
    return context.switchToHttp().getRequest<Express.Request>();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    if (!result) {
      return false;
    }

    // FIX: Use getRequest(context) instead of switchToHttp().getRequest() to support GraphQL
    const request = this.getRequest(context);
    const user = request.user;

    // Check for partial_auth (2FA pending) restriction
    if (user && user.authStage === 'partial_auth') {
      const isGraphql = context.getType() === 'graphql';
      
      if (isGraphql) {
        throw new UnauthorizedException('2FA verification required');
      }

      // Allow specific HTTP endpoints like /two-factor/verify
      const path = request.path || request.url;
      if (!path?.includes('/two-factor/verify')) {
        throw new UnauthorizedException('2FA verification required');
      }
    }

    return true;
  }
}
