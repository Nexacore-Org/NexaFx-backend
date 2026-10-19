import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import {
  validateAuthenticatedUser,
  type JwtPayload,
} from '../auth/authenticated-user';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.auth?.token;

    if (!token) {
      client.emit('401', { message: 'Unauthorized' });
      client.disconnect();
      throw new WsException('Unauthorized');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      // Same validation as the HTTP JwtStrategy (#1321): rejects partial_auth
      // tokens, suspended/deleted/deactivated accounts and downgrades
      // impersonation tokens.
      client.data.user = await validateAuthenticatedUser(
        this.usersService,
        payload,
      );

      return true;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`WS auth failed: ${err.message}`);
      client.emit('401', { message: 'Unauthorized' });
      client.disconnect();
      throw new WsException('Unauthorized');
    }
  }
}
