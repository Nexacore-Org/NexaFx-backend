import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { UsersService } from '../users/users.service';
import { WsJwtGuard, authenticateWsClient } from './ws-jwt.guard';

// #700 / #1518: connection/subscription limits for the rate feed.
const MAX_CONNECTIONS = Number(process.env.RATE_WS_MAX_CONNECTIONS ?? 500);
const MAX_CONNECTIONS_PER_USER = Number(
  process.env.RATE_WS_MAX_USER_CONNECTIONS ?? 5,
);
const MAX_SUBSCRIPTIONS_PER_CONNECTION = 5;

@WebSocketGateway({
  namespace: '/rates',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class RatesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RatesGateway.name);
  private connectionCount = 0;
  private readonly userConnections = new Map<string, Set<string>>();
  private readonly authenticatedSockets = new Map<string, string>();

  constructor(
    private readonly service: ExchangeRatesService,
    @Optional() private readonly jwtService?: JwtService,
    @Optional() private readonly usersService?: UsersService,
  ) {}

  getActiveConnectionCount(): number {
    return this.connectionCount;
  }

  getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size ?? 0;
  }

  // #1518: Authenticate before counting toward MAX_CONNECTIONS and enforce a per-user cap.
  async handleConnection(client: Socket) {
    try {
      const user = await authenticateWsClient(
        client,
        this.jwtService,
        this.usersService,
      );

      if (this.connectionCount >= MAX_CONNECTIONS) {
        client.emit?.('error', {
          message: 'Rate feed connection limit reached',
        });
        client.disconnect?.(true);
        return;
      }

      const existingUserSockets =
        this.userConnections.get(user.userId) ?? new Set<string>();
      if (
        !existingUserSockets.has(client.id) &&
        existingUserSockets.size >= MAX_CONNECTIONS_PER_USER
      ) {
        client.emit?.('error', {
          message: `Maximum ${MAX_CONNECTIONS_PER_USER} concurrent rate feed connections per user reached`,
        });
        client.disconnect?.(true);
        return;
      }

      if (!existingUserSockets.has(client.id)) {
        existingUserSockets.add(client.id);
        this.userConnections.set(user.userId, existingUserSockets);
        this.authenticatedSockets.set(client.id, user.userId);
        this.connectionCount += 1;
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        `Rejected unauthenticated /rates socket ${client?.id}: ${err.message}`,
      );
      client.emit?.('401', { message: 'Unauthorized' });
      client.emit?.('error', { message: 'Unauthorized' });
      client.disconnect?.(true);
    }
  }

  handleDisconnect(client?: Socket) {
    if (!client?.id) {
      if (this.authenticatedSockets.size === 0) {
        this.connectionCount = Math.max(0, this.connectionCount - 1);
      }
      return;
    }

    const userId = this.authenticatedSockets.get(client.id);
    if (!userId) {
      // Unauthenticated sockets were never counted; do not decrement connectionCount.
      return;
    }

    this.authenticatedSockets.delete(client.id);
    this.connectionCount = Math.max(0, this.connectionCount - 1);

    const sockets = this.userConnections.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  afterInit() {
    this.logger.log('RatesGateway initialized');
    this.service.rateUpdates$.subscribe((data) => {
      const roomName = `rate:${data.from}:${data.to}`;
      this.server.to(roomName).emit('rate_update', data);
      this.logger.debug(`Emitted rate_update for ${roomName}`);
    });
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { from: string; to: string },
  ) {
    const from = data?.from?.toUpperCase();
    const to = data?.to?.toUpperCase();

    if (!from || !to) {
      client.emit('error', {
        message: 'Currency "from" and "to" are required',
      });
      return;
    }

    // #700: cap subscriptions per connection. The client is always in its own
    // id room, so subscribed pairs = rooms.size - 1.
    const roomCount = client.rooms ? client.rooms.size : 1;
    if (roomCount - 1 >= MAX_SUBSCRIPTIONS_PER_CONNECTION) {
      client.emit('error', {
        message: `A connection may subscribe to at most ${MAX_SUBSCRIPTIONS_PER_CONNECTION} pairs`,
      });
      return;
    }

    try {
      await this.service.validateCurrencyPair(from, to);
      const roomName = `rate:${from}:${to}`;
      client.join(roomName);
      this.logger.log(`Client ${client.id} subscribed to ${roomName}`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`Subscription failed for ${from}/${to}: ${err.message}`);
      client.emit('error', { message: `Invalid currency pair: ${from}/${to}` });
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { from: string; to: string },
  ) {
    const from = data?.from?.toUpperCase();
    const to = data?.to?.toUpperCase();

    if (!from || !to) return;

    const roomName = `rate:${from}:${to}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} unsubscribed from ${roomName}`);
  }
}
