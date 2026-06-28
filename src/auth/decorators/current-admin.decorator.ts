import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUserPayload } from './current-user.decorator';

/**
 * Parameter decorator that extracts the admin identity from the current request.
 *
 * - For normal admin requests: returns request.user (the authenticated admin).
 * - For impersonation requests: returns the adminId stored in
 *   request.user.impersonatedBy (i.e. the original admin who started the session).
 *
 * Usage:
 *   async myMethod(@CurrentAdmin() admin: { userId: string }) { ... }
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { userId: string; email?: string } => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserPayload }>();

    const user = request.user;

    if (user?.isImpersonation && user.impersonatedBy) {
      // Impersonation context — return the original admin's id
      return { userId: user.impersonatedBy };
    }

    // Normal context — return the authenticated user as-is
    return { userId: user?.userId, email: user?.email };
  },
);
