import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { WsJwtGuard } from './ws-jwt.guard';

@WebSocketGateway({
  namespace: '/rates',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class RatesGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RatesGateway.name);

  constructor(private readonly service: ExchangeRatesService) {}

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
      client.emit('error', { message: 'Currency "from" and "to" are required' });
      return;
    }

    try {
      await this.service.validateCurrencyPair(from, to);
      const roomName = `rate:${from}:${to}`;
      client.join(roomName);
      this.logger.log(`Client ${client.id} subscribed to ${roomName}`);
    } catch (error) {
      this.logger.warn(`Subscription failed for ${from}/${to}: ${error.message}`);
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
