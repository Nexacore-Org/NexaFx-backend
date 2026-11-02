import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { forwardRef, Inject, Logger, Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import {
  validateAuthenticatedUser,
  type JwtPayload,
} from '../auth/authenticated-user';
import { buildWsCorsOptions, parseAllowedOrigins } from '../gateways/ws-cors';

export { buildWsCorsOptions, parseAllowedOrigins };

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * WebSocket gateway for real‑time notification delivery.
 * Namespace: /notifications
 * CORS origin is taken from ALLOWED_ORIGINS env variable (comma-separated).
 */
@WebSocketGateway({
  cors: buildWsCorsOptions(),
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly jwtService: JwtService,
    @Optional()
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('NotificationsGateway');
  // Map of userId -> Set of sockets (supports multiple tabs)
  private static userSockets: Map<string, Set<Socket>> = new Map();
  // Map of socketId -> token expiry disconnect timer
  private readonly expiryTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  /** Handle new socket connections */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) throw new Error('Missing token');
      const raw = token.startsWith('Bearer ') ? token.slice(7) : token;
      const payload = await this.jwtService.verifyAsync<
        JwtPayload & {
          exp?: number;
          partial_auth?: boolean;
          impersonation?: boolean;
        }
      >(raw);
      if (payload.partial_auth || payload.impersonation) {
        throw new Error('Partial auth or impersonation token not allowed');
      }

      if (typeof payload.exp === 'number') {
        const ttlMs = payload.exp * 1000 - Date.now();
        if (ttlMs <= 0) {
          throw new Error('Token has expired');
        }
      }

      const authenticatedUser = await validateAuthenticatedUser(
        this.usersService,
        payload,
      );
      if (client.data) {
        client.data.user = authenticatedUser;
      } else {
        (client as Socket & { data: Record<string, unknown> }).data = {
          user: authenticatedUser,
        };
      }
      const userId = authenticatedUser.userId;

      const room = `user:${userId}`;
      client.join(room);
      if (!NotificationsGateway.userSockets.has(userId)) {
        NotificationsGateway.userSockets.set(userId, new Set());
      }
      NotificationsGateway.userSockets.get(userId)!.add(client);

      if (typeof payload.exp === 'number') {
        const ttlMs = Math.max(0, payload.exp * 1000 - Date.now());
        this.scheduleExpiryDisconnect(client, ttlMs);
      }

      this.logger.log(`Socket ${client.id} connected, joined ${room}`);
    } catch (err) {
      this.logger.warn(
        `Socket ${client.id} rejected: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  private scheduleExpiryDisconnect(client: Socket, ttlMs: number) {
    this.clearExpiryTimer(client.id);
    const delay = Math.min(ttlMs, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => {
      this.expiryTimers.delete(client.id);
      this.logger.log(`Socket ${client.id} token expired, disconnecting`);
      client.disconnect(true);
      this.handleDisconnect(client);
    }, delay);
    timer.unref?.();
    this.expiryTimers.set(client.id, timer);
  }

  private clearExpiryTimer(socketId: string) {
    const existing = this.expiryTimers.get(socketId);
    if (existing) {
      clearTimeout(existing);
      this.expiryTimers.delete(socketId);
    }
  }

  /** Cleanup on disconnection */
  handleDisconnect(client: Socket) {
    this.clearExpiryTimer(client.id);
    for (const [
      userId,
      sockets,
    ] of NotificationsGateway.userSockets.entries()) {
      if (sockets.has(client)) {
        sockets.delete(client);
        if (sockets.size === 0) {
          NotificationsGateway.userSockets.delete(userId);
        }
        this.logger.log(`Socket ${client.id} disconnected from user:${userId}`);
        break;
      }
    }
  }

  /** Emit an event to a specific user (all their sockets) */
  sendToUser(userId: string, eventOrPayload: string | any, payload?: any) {
    const room = `user:${userId}`;
    if (this.server) {
      if (payload === undefined && typeof eventOrPayload !== 'string') {
        this.server.to(room).emit('notification', eventOrPayload);
      } else {
        this.server.to(room).emit(eventOrPayload, payload);
      }
    } else {
      this.logger.warn('NotificationsGateway not initialized – cannot emit');
    }
  }

  /** Count active connections */
  static getActiveConnections(): number {
    let count = 0;
    for (const sockets of NotificationsGateway.userSockets.values()) {
      count += sockets.size;
    }
    return count;
  }
}
