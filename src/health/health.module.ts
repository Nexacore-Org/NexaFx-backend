import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarHealthIndicator } from './indicators/stellar-health.indicator';
import { BullMQHealthIndicator } from './indicators/bullmq-health.indicator';

@Module({

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    RedisHealthIndicator,
    StellarHealthIndicator,
    BullMQHealthIndicator,
  ],
})
export class HealthModule {}
