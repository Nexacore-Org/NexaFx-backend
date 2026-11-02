import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { QueuesModule } from '../modules/queues/queues.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarHealthIndicator } from './indicators/stellar-health.indicator';
import { BullMQHealthIndicator } from './indicators/bullmq-health.indicator';
import { MailgunHealthIndicator } from './indicators/mailgun-health.indicator';

@Module({
  imports: [TerminusModule, QueuesModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    RedisHealthIndicator,
    StellarHealthIndicator,
    BullMQHealthIndicator,
    MailgunHealthIndicator,
  ],
  exports: [HealthService],
})
export class HealthModule {}
