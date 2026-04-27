import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';
import { CurrencyPair } from './entities/currency-pair.entity';
import { CurrencyPairService } from './services/currency-pair.service';
import { CurrencyPairController } from './controllers/currency-pair.controller';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Currency, CurrencyPair]),
    forwardRef(() => ExchangeRatesModule),
  ],
  controllers: [CurrenciesController, CurrencyPairController],
  providers: [CurrenciesService, CurrencyPairService],
  exports: [CurrenciesService, CurrencyPairService],
})
export class CurrenciesModule {}
