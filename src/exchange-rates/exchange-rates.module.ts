import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { CurrenciesModule } from '../currencies/currencies.module';
import { ExchangeRatesProviderClient } from './providers/exchange-rates.provider';
import { ExchangeRatesCache } from './cache/exchange-rates.cache';
import { RatesGateway } from './rates.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, HttpModule, CurrenciesModule, AuthModule],
  controllers: [ExchangeRatesController],
  providers: [
    ExchangeRatesService,
    ExchangeRatesProviderClient,
    ExchangeRatesCache,
    RatesGateway,
    WsJwtGuard,
  ],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
