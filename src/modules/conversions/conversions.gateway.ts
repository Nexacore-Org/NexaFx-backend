import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
@Injectable()
export class ConversionsGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConversionsGateway.name);

  emitTransactionUpdated(data: any) {
    try {
      if (this.server) {
        this.server.emit('transaction.updated', data);
        this.logger.log(`Emitted transaction.updated event for tx ${data.id || data.transactionId}`);
      }
    } catch (error) {
      this.logger.error('Failed to emit transaction.updated event', error);
    }
  }
}
