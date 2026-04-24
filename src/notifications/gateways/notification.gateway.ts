import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationPersistenceService } from '../services/notification-persistence.service';

// Simple WebSocket guard for notification gateway
@Injectable()
export class NotificationWsGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData();

    try {
      const token = client.handshake.query.token || client.handshake.auth.token;
      if (!token) return false;

      const payload = await this.jwtService.verifyAsync(token as string);
      client.data.user = { userId: payload.sub };
      return true;
    } catch {
      return false;
    }
  }
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSocketMap: Map<string, string> = new Map(); // userId -> socketId

  constructor(
    private readonly jwtService: JwtService,
    private readonly persistenceService: NotificationPersistenceService,
  ) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      // Authenticate using JWT from query params or handshake auth
      const token =
        client.handshake.query.token || client.handshake.auth.token;

      if (!token) {
        this.logger.warn('WebSocket connection rejected: No token provided');
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token as string);
      const userId = payload.sub;

      // Map userId to socketId
      this.userSocketMap.set(userId, client.id);

      this.logger.log(`User ${userId} connected to notifications WebSocket`);

      // Join user-specific room
      client.join(`user-${userId}`);

      // Send initial unread count
      const { unreadCount } = await this.persistenceService.getUnreadCount(
        userId,
      );
      client.emit('badge_count', { unreadCount });
    } catch (error) {
      this.logger.error(`WebSocket authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    // Remove from userSocketMap
    for (const [userId, socketId] of this.userSocketMap.entries()) {
      if (socketId === client.id) {
        this.userSocketMap.delete(userId);
        this.logger.log(`User ${userId} disconnected from notifications`);
        break;
      }
    }
  }

  /**
   * Emit new notification to user
   */
  async emitNewNotification(userId: string, notification: any) {
    const socketId = this.userSocketMap.get(userId);

    if (socketId) {
      this.server.to(`user-${userId}`).emit('new_notification', notification);

      // Update badge count
      const { unreadCount } = await this.persistenceService.getUnreadCount(
        userId,
      );
      this.server.to(`user-${userId}`).emit('badge_count', { unreadCount });

      this.logger.debug(
        `Emitted new notification to user ${userId} on socket ${socketId}`,
      );
    } else {
      this.logger.debug(
        `User ${userId} not connected, notification will be delivered on next connection`,
      );
    }
  }

  /**
   * Emit badge count update
   */
  async emitBadgeCount(userId: string) {
    const { unreadCount } = await this.persistenceService.getUnreadCount(
      userId,
    );
    this.server.to(`user-${userId}`).emit('badge_count', { unreadCount });
  }

  /**
   * Handle mark as read from client
   */
  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @MessageBody() data: { notificationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Authenticate inline
      const token = client.handshake.query.token || client.handshake.auth.token;
      if (!token) throw new Error('Authentication required');

      const payload = await this.jwtService.verifyAsync(token as string);
      const userId = payload.sub;

      await this.persistenceService.markAsRead(data.notificationId, userId);

      // Emit updated badge count
      await this.emitBadgeCount(userId);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle mark all as read from client
   */
  @SubscribeMessage('mark_all_read')
  async handleMarkAllRead(@ConnectedSocket() client: Socket) {
    try {
      // Authenticate inline
      const token = client.handshake.query.token || client.handshake.auth.token;
      if (!token) throw new Error('Authentication required');

      const payload = await this.jwtService.verifyAsync(token as string);
      const userId = payload.sub;

      await this.persistenceService.markAllAsRead(userId);

      // Emit badge count (should be 0)
      await this.emitBadgeCount(userId);

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Failed to mark all notifications as read: ${error.message}`,
      );
      return { success: false, error: error.message };
    }
  }
}
