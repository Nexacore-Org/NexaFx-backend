import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

/**
 * Metadata key used by @BlockDuringImpersonation().
 */
export const BLOCK_IMPERSONATION_KEY = 'blockDuringImpersonation';

/**
 * Decorator: mark an endpoint that must NOT be accessible during impersonation.
 *
 * Usage:
 *   @BlockDuringImpersonation()
 *   async changePassword(...) { ... }
 */
export const BlockDuringImpersonation = () =>
  SetMetadata(BLOCK_IMPERSONATION_KEY, true);

/**
 * Guard that enforces impersonation restrictions.
 *
 * When the request carries an impersonation token the following are forbidden:
 *   - Any endpoint decorated with @BlockDuringImpersonation()
 *   - Any endpoint under the /admin prefix (ADMIN-only routes)
 *   - Calling POST /admin/impersonate/:userId (nested impersonation)
 */
@Injectable()
export class ImpersonationRestrictionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = this.getRequest(context);
    if (!request) return true;

    const user = request.user;
    if (!user?.isImpersonation) {
      // Not an impersonation session — allow everything
      return true;
    }

    // Check if the handler/class is explicitly blocked
    const isBlocked = this.reflector.getAllAndOverride<boolean>(
      BLOCK_IMPERSONATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isBlocked) {
      throw new ForbiddenException('Action not permitted during impersonation');
    }

    // Block access to any admin-only route except POST /admin/impersonate/end
    const url = request.originalUrl ?? request.url ?? '';
    const path = url.split('?')[0];

    // Allow only the end-impersonation endpoint
    const isEndImpersonation =
      request.method === 'POST' && /\/admin\/impersonate\/end/.test(path);

    // Block any other /admin/* route
    if (/\/admin\//.test(path) && !isEndImpersonation) {
      throw new ForbiddenException('Action not permitted during impersonation');
    }

    // Block password change endpoints and 2FA setup/disable/confirm/verify/recover/regenerate endpoints
    if (
      /(password|2fa|two-factor)/i.test(path) &&
      !path.includes('status') // Allow checking status but not modifications
    ) {
      throw new ForbiddenException('Action not permitted during impersonation');
    }

    return true;
  }

  /**
   * REST requests expose the request directly, GraphQL wraps it in the
   * execution context. Without this branch a GraphQL operation would read a
   * context object with no user and silently skip every restriction.
   */
  private getRequest(
    context: ExecutionContext,
  ): (Request & { user: CurrentUserPayload }) | undefined {
    if (context.getType<string>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext<{
        req?: Request & { user: CurrentUserPayload };
      }>()?.req;
    }
    return context.switchToHttp().getRequest<
      Request & { user: CurrentUserPayload }
    >();
  }
}
