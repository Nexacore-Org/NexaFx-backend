import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { Currency } from './entities/currency.entity';
import { RateFetcherService } from './services/rate-fetcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Currency]),
    ScheduleModule.forRoot(),
  ],
  controllers: [CurrenciesController],
  providers: [CurrenciesService, RateFetcherService],
  exports: [CurrenciesService, RateFetcherService],
})
export class CurrenciesModule {}
