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

export interface ImpersonationSessionLookup {
  validateSession?: (
    targetUserId: string,
    jti: string,
  ) => Promise<{ adminId: string; targetUserId?: string; jti?: string } | null>;
  get?: <T>(key: string) => Promise<T | null>;
}

/**
 * Single source of truth for turning a decoded JWT payload into an
 * authenticated principal.
 *
 * Both the HTTP Passport strategy (JwtStrategy) and the WebSocket guard
 * (WsJwtGuard) call this, so the two transports cannot drift apart (#1321):
 *  - `partial_auth` tokens (password verified, 2FA still pending) are rejected
 *  - suspended / deleted / deactivated accounts are rejected
 *  - impersonation tokens are validated against active Redis sessions and the
 *    impersonating admin's current status/role, and downgraded to USER role
 *
 * @throws ForbiddenException when the account or token stage forbids access
 * @throws UnauthorizedException when the user or impersonation session cannot be resolved
 */
export async function validateAuthenticatedUser(
  usersService: UsersService,
  payload: JwtPayload,
  sessionLookup?: ImpersonationSessionLookup,
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

  if (payload.isImpersonation) {
    if (!payload.impersonatedBy) {
      throw new UnauthorizedException('Invalid impersonation token');
    }

    if (sessionLookup) {
      if (!payload.jti) {
        throw new UnauthorizedException(
          'Invalid impersonation token: missing session identifier',
        );
      }

      const session = sessionLookup.validateSession
        ? await sessionLookup.validateSession(payload.sub, payload.jti)
        : sessionLookup.get
          ? await sessionLookup.get<{ adminId: string }>(
              `nexafx:impersonation:${payload.sub}:${payload.jti}`,
            )
          : null;

      if (!session || session.adminId !== payload.impersonatedBy) {
        throw new UnauthorizedException(
          'Impersonation session has ended or expired',
        );
      }
    }

    const admin = await usersService.findById(payload.impersonatedBy);
    if (
      !admin ||
      admin.isSuspended ||
      admin.isDeleted ||
      admin.isActive === false ||
      (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN')
    ) {
      throw new UnauthorizedException(
        'Impersonating admin is no longer authorized',
      );
    }
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

export const validateJwtUser = validateAuthenticatedUser;
