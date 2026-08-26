import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarHealthIndicator } from './indicators/stellar-health.indicator';
import { BullMQHealthIndicator } from './indicators/bullmq-health.indicator';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    RedisHealthIndicator,
    StellarHealthIndicator,
    BullMQHealthIndicator,
  ],
})
export class HealthModule {}
