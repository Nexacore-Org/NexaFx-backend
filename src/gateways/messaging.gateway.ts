import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { WsJwtGuard, authenticateWsClient } from './ws-jwt.guard';

interface ConnectedUser {
  socketId: string;
  lastSeen: Date;
}

@WebSocketGateway({
  namespace: '/messages',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private readonly connectedUsers = new Map<string, ConnectedUser>();

  constructor(
    @Optional() private readonly jwtService?: JwtService,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  afterInit() {
    this.logger.log('MessagingGateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const user = await authenticateWsClient(
        client,
        this.jwtService,
        this.usersService,
      );
      const userId = user.userId;
      client.join?.(`user:${userId}`);
      this.connectedUsers.set(userId, {
        socketId: client.id,
        lastSeen: new Date(),
      });
      this.logger.debug(
        `User ${userId} connected to messaging (socket: ${client.id})`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        `Rejected unauthenticated /messages socket ${client?.id}: ${err.message}`,
      );
      client.emit?.('401', { message: 'Unauthorized' });
      client.disconnect?.(true);
    }
  }

  handleDisconnect(client: Socket) {
    const payload = client?.data?.user as { userId?: string } | undefined;
    const userId = payload?.userId;
    if (userId) {
      const entry = this.connectedUsers.get(userId);
      if (entry?.socketId === client.id) {
        entry.lastSeen = new Date();
        this.logger.debug(`User ${userId} disconnected from messaging`);
      }
    }
  }

  emitMessageNew(recipientId: string, message: unknown) {
    this.server.to(`user:${recipientId}`).emit('message.new', message);
  }

  isUserOnline(userId: string): boolean {
    const entry = this.connectedUsers.get(userId);
    if (!entry) return false;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    return entry.lastSeen > fiveMinAgo;
  }
}
