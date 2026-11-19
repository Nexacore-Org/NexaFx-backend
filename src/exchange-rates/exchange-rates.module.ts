import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { CurrenciesModule } from '../currencies/currencies.module';
import { ExchangeRatesProviderClient } from './providers/exchange-rates.provider';
import { ExchangeRateSnapshot } from './entities/exchange-rate-snapshot.entity';
import { resolveJwtSecret } from '../common/helpers/jwt-secret';

type JwtExpiryValue = `${number}${'s' | 'm' | 'h' | 'd'}`;

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    CurrenciesModule,
    TypeOrmModule.forFeature([ExchangeRateSnapshot]),
    CacheModule.register(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') ??
          '15m') as JwtExpiryValue;

        return {
          secret: resolveJwtSecret(configService),
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, ExchangeRatesProviderClient],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
