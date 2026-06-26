import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_QUEUE, WEBHOOK_QUEUE } from './queue.constants';
import { redisConnectionFromUrl } from './queue-connection';
import { QueuesDashboardService } from './queues-dashboard.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: redisConnectionFromUrl(configService.get('REDIS_URL')),
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: EMAIL_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: WEBHOOK_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'fixed', delay: 60_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    ),
  ],
  providers: [QueuesDashboardService],
  exports: [BullModule, QueuesDashboardService],
})
export class QueuesModule {}
