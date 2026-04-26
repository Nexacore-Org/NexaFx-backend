import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { RatesGateway } from './rates.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { GatewaysController } from './gateways.controller';

@Module({
  imports: [
    ExchangeRatesModule,
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
          '15m') as StringValue;

        return {
          secret: secret ?? 'default-secret-change-in-production',
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [GatewaysController],
  providers: [RatesGateway, WsJwtGuard],
})
export class GatewaysModule {}
