import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ALLOW_PARTIAL_AUTH_KEY } from '../../auth/decorators/allow-partial-auth.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const allowPartialAuth = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PARTIAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const ok = await super.canActivate(context);
    if (!ok) return false;

    const req = this.getRequest(context) as {
      user?: { authStage?: string };
    };

    if (req.user?.authStage === 'partial_auth' && !allowPartialAuth) {
      throw new ForbiddenException(
        'Two-factor verification required to access this resource',
      );
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
}
