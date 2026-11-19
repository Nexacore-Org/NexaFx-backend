import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { UsersModule } from '../users/users.module';
import { RatesGateway } from './rates.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { GatewaysController } from './gateways.controller';
import { resolveJwtSecret } from '../common/helpers/jwt-secret';

@Module({
  imports: [
    ExchangeRatesModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') ??
          '15m') as StringValue;

        return {
          secret: resolveJwtSecret(configService),
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
