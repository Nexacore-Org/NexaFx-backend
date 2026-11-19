import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { UsersService } from '../users/users.service';
import type { UserPlan } from '../users/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  authStage?: 'partial_auth';
  tokenVersion?: number;
  // Impersonation fields — only present when isImpersonation === true
  isImpersonation?: boolean;
  impersonatedBy?: string;
  jti?: string;
}

/** Shape attached to request.user after JWT validation */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  authStage?: string;
  isImpersonation?: boolean;
  impersonatedBy?: string;
  jti?: string;
  plan?: UserPlan;
}

/**
 * Single source of truth for turning a decoded JWT payload into an
 * authenticated principal.
 *
 * Both the HTTP Passport strategy (JwtStrategy) and the WebSocket guard
 * (WsJwtGuard) call this, so the two transports cannot drift apart (#1321):
 *  - `partial_auth` tokens (password verified, 2FA still pending) are returned
 *    as a limited principal; HTTP callers must honour @AllowPartialAuth() and
 *    WebSocket callers must reject the stage explicitly
 *  - suspended / deleted / deactivated accounts are rejected
 *  - impersonation tokens are downgraded to the USER role
 *
 * @throws ForbiddenException when the account forbids access
 * @throws UnauthorizedException when the user cannot be resolved
 */
export async function validateAuthenticatedUser(
  usersService: UsersService,
  payload: JwtPayload,
): Promise<AuthenticatedUser> {
  if (!payload?.sub) {
    throw new UnauthorizedException('Invalid token payload');
  }

  const user = await usersService.findById(payload.sub);

  if (!user) {
    throw new UnauthorizedException('User not found');
  }

  if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    throw new UnauthorizedException('Session has been revoked');
  }

  if (user.isSuspended) {
    throw new ForbiddenException('Account is suspended');
  }

  if (user.isDeleted) {
    throw new UnauthorizedException('Account has been deleted');
  }

  if (!user.isActive) {
    throw new UnauthorizedException('User account is deactivated');
  }

  return {
    userId: user.id,
    email: user.email,
    // Impersonation tokens never carry the impersonated user's privileges.
    role: payload.isImpersonation ? 'USER' : user.role,
    authStage: payload.authStage,
    isImpersonation: payload.isImpersonation ?? false,
    impersonatedBy: payload.impersonatedBy,
    jti: payload.jti,
    plan: user.plan,
  };
}
