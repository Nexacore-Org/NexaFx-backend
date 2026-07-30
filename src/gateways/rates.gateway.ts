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
import { UseGuards, Logger } from '@nestjs/common';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { WsJwtGuard } from './ws-jwt.guard';

// #700: connection/subscription limits for the public rate feed.
const MAX_CONNECTIONS = Number(process.env.RATE_WS_MAX_CONNECTIONS ?? 500);
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

  constructor(private readonly service: ExchangeRatesService) {}

  // #700: cap concurrent connections to the /rates namespace.
  handleConnection(client: Socket) {
    if (this.connectionCount >= MAX_CONNECTIONS) {
      client.emit('error', { message: 'Rate feed connection limit reached' });
      client.disconnect(true);
      return;
    }
    this.connectionCount += 1;
  }

  handleDisconnect() {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
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
    if (client.rooms.size - 1 >= MAX_SUBSCRIPTIONS_PER_CONNECTION) {
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
