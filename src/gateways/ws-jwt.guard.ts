import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import {
  type AuthenticatedUser,
  type JwtPayload,
  validateAuthenticatedUser,
} from '../auth/authenticated-user';

/**
 * Extract and normalize a JWT from a Socket.IO handshake (`auth.token` or
 * `headers.authorization`), stripping any leading `Bearer ` prefix.
 */
export function extractWsToken(client: Socket): string | undefined {
  const authToken = client?.handshake?.auth?.token;
  const headerAuth = client?.handshake?.headers?.authorization;
  const raw =
    typeof authToken === 'string' && authToken.trim().length > 0
      ? authToken.trim()
      : typeof headerAuth === 'string' && headerAuth.trim().length > 0
        ? headerAuth.trim()
        : undefined;

  if (!raw) {
    return undefined;
  }

  return raw.replace(/^Bearer\s+/i, '').trim() || undefined;
}

/**
 * Shared WebSocket connection-time and message-time authentication helper.
 * Verifies the JWT and validates user account status via `validateAuthenticatedUser`.
 */
export async function authenticateWsClient(
  client: Socket,
  jwtService?: JwtService,
  usersService?: UsersService,
): Promise<AuthenticatedUser> {
  const token = extractWsToken(client);
  if (!token) {
    throw new UnauthorizedException('Missing authentication token');
  }

  if (!jwtService) {
    throw new UnauthorizedException('JWT service unavailable');
  }

  const payload = await jwtService.verifyAsync<
    JwtPayload & { partial_auth?: boolean; impersonation?: boolean }
  >(token);

  if (!payload?.sub) {
    throw new UnauthorizedException('Invalid token payload');
  }

  if (payload.authStage === 'partial_auth' || payload.partial_auth) {
    throw new ForbiddenException(
      'Two-factor verification required to access this resource',
    );
  }

  let user: AuthenticatedUser;
  if (usersService) {
    user = await validateAuthenticatedUser(usersService, payload);
  } else {
    user = {
      userId: String(payload.sub),
      email: payload.email ?? '',
      role:
        payload.isImpersonation || payload.impersonation
          ? 'USER'
          : (payload.role ?? 'USER'),
      authStage: payload.authStage,
      isImpersonation: Boolean(
        payload.isImpersonation ?? payload.impersonation ?? false,
      ),
      impersonatedBy: payload.impersonatedBy,
      jti: payload.jti,
    };
  }

  if (!client.data || typeof client.data !== 'object') {
    (client as any).data = {};
  }
  client.data.user = user;
  return user;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();

    try {
      await authenticateWsClient(client, this.jwtService, this.usersService);
      return true;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`WS auth failed: ${err.message}`);
      client.emit?.('401', { message: 'Unauthorized' });
      client.disconnect?.(true);
      throw new WsException('Unauthorized');
    }
  }
}
