import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StellarModule } from '../blockchain/stellar/stellar.module';

@Module({
  imports: [StellarModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}