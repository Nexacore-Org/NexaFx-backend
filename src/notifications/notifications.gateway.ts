import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

/**
 * WebSocket gateway for real‑time notification delivery.
 * Namespace: /notifications
 * CORS origin is taken from ALLOWED_ORIGINS env variable.
 */
@WebSocketGateway({
  cors: { origin: process.env.ALLOWED_ORIGINS },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly jwtService: JwtService) {
    // Store a reference for static methods
    (global as any).__notificationsGatewayInstance = this;
  }
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('NotificationsGateway');
  // Map of userId -> Set of sockets (supports multiple tabs)
  private static userSockets: Map<string, Set<Socket>> = new Map();

  /** Handle new socket connections */
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) throw new Error('Missing token');
      const raw = token.startsWith('Bearer ') ? token.slice(7) : token;
      const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
      const payload = await jwtService.verifyAsync(raw);
      const userId = payload.sub?.toString();
      if (!userId) throw new Error('Invalid token payload');

      const room = `user:${userId}`;
      client.join(room);
      if (!NotificationsGateway.userSockets.has(userId)) {
        NotificationsGateway.userSockets.set(userId, new Set());
      }
      NotificationsGateway.userSockets.get(userId)!.add(client);
      this.logger.log(`Socket ${client.id} connected, joined ${room}`);
    } catch (err) {
      this.logger.warn(`Socket ${client.id} rejected: ${err.message}`);
      client.disconnect(true);
    }
  }

  /** Cleanup on disconnection */
  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of NotificationsGateway.userSockets.entries()) {
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
  static sendToUser(userId: string, event: string, payload: any) {
    const room = `user:${userId}`;
    const gateway = (global as any).__notificationsGatewayInstance as NotificationsGateway;
    if (gateway && gateway.server) {
      gateway.server.to(room).emit(event, payload);
    } else {
      console.warn('NotificationsGateway not initialized – cannot emit');
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
