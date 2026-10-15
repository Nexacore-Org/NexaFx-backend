import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { RateComparisonService } from './rate-comparison.service';
import { RateComparisonController } from './rate-comparison.controller';
import { ExchangeRatesModule } from './exchange-rates.module';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [HttpModule, CacheModule.register(), ExchangeRatesModule, FeesModule],
  controllers: [RateComparisonController],
  providers: [RateComparisonService],
  exports: [RateComparisonService],
})
export class RateComparisonModule {}
