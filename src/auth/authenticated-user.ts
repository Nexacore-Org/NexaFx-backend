import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  authStage?: 'partial_auth';
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
}

/**
 * Single source of truth for turning a decoded JWT payload into an
 * authenticated principal.
 *
 * Both the HTTP Passport strategy (JwtStrategy) and the WebSocket guard
 * (WsJwtGuard) call this, so the two transports cannot drift apart (#1321):
 *  - `partial_auth` tokens (password verified, 2FA still pending) are rejected
 *  - suspended / deleted / deactivated accounts are rejected
 *  - impersonation tokens are downgraded to the USER role
 *
 * @throws ForbiddenException when the account or token stage forbids access
 * @throws UnauthorizedException when the user cannot be resolved
 */
export async function validateAuthenticatedUser(
  usersService: UsersService,
  payload: JwtPayload,
): Promise<AuthenticatedUser> {
  if (!payload?.sub) {
    throw new UnauthorizedException('Invalid token payload');
  }

  if (payload.authStage === 'partial_auth') {
    throw new ForbiddenException(
      'Two-factor verification required to access this resource',
    );
  }

  const user = await usersService.findById(payload.sub);

  if (!user) {
    throw new UnauthorizedException('User not found');
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
  };
}
