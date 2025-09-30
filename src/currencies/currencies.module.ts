import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { Currency } from './entities/currency.entity';
import { RateFetcherService } from './services/rate-fetcher.service';
import { CurrencySeederService } from './services/currency-seeder.service';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Currency]),
    ScheduleModule.forRoot(),
    AuditModule,
  ],
  controllers: [CurrenciesController],
  providers: [CurrenciesService, RateFetcherService, CurrencySeederService],
  exports: [CurrenciesService, RateFetcherService, CurrencySeederService],
})
export class CurrenciesModule {}
