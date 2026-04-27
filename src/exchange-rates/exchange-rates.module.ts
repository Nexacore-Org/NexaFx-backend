import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { CurrenciesModule } from '../currencies/currencies.module';
import { ExchangeRatesProviderClient } from './providers/exchange-rates.provider';
import { ExchangeRatesCache } from './cache/exchange-rates.cache';

type JwtExpiryValue = `${number}${'s' | 'm' | 'h' | 'd'}`;

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    CurrenciesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        if (!secret && isProduction) {
          throw new Error('JWT_SECRET must be set in production environment');
        }

        const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') ??
          '15m') as JwtExpiryValue;

        return {
          secret: secret ?? 'default-secret-change-in-production',
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [ExchangeRatesController],
  providers: [
    ExchangeRatesService,
    ExchangeRatesProviderClient,
    ExchangeRatesCache,
  ],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
