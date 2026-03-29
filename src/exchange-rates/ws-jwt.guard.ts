import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const authHeader = client.handshake.headers.authorization;

      if (!authHeader) {
        throw new WsException('Authorization header is missing');
      }

      const [type, token] = authHeader.split(' ');
      if (type !== 'Bearer' || !token) {
        throw new WsException('Invalid token format');
      }

      const payload = await this.jwtService.verifyAsync(token);
      // Store user info in client data
      client.data.user = payload;
      return true;
    } catch (error) {
      this.logger.error(`WS Authentication failed: ${error.message}`);
      throw new WsException('Unauthorized access');
    }
  }
}
