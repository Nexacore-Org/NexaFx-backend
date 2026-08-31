import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueuesDashboardService } from './queues-dashboard.service';
import { AdminQueueAuthMiddleware } from './admin-queue-auth.middleware';
import {
  getQueueRedisConnection,
  QueueRedisConnectionOptions,
} from './queue-connection';
import { QUEUE_CONNECTION_TOKEN } from './queue.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: QUEUE_CONNECTION_TOKEN,
      useFactory: (configService: ConfigService): QueueRedisConnectionOptions => {
        return getQueueRedisConnection(configService);
      },
      inject: [ConfigService],
    },
    QueuesDashboardService,
    AdminQueueAuthMiddleware,
  ],
  exports: [QUEUE_CONNECTION_TOKEN, QueuesDashboardService],
})
export class QueuesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Secure the admin queues dashboard endpoint with Basic Auth
    consumer
      .apply(AdminQueueAuthMiddleware)
      .forRoutes({ path: 'admin/queues*', method: RequestMethod.ALL });
  }
}
