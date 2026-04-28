import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateAlert } from './entities/rate-alert.entity';
import { RateAlertsService } from './rate-alerts.service';
import { RateAlertsController } from './rate-alerts.controller';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateAlert]),
    ExchangeRatesModule,
    NotificationsModule,
    UsersModule,
    FirebaseModule,
    ConfigModule,
  ],
  providers: [RateAlertsService],
  controllers: [RateAlertsController],
  exports: [RateAlertsService],
})
export class RateAlertsModule {}
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateAlertsController } from './rate-alerts.controller';
import { RateAlertsService } from './rate-alerts.service';
import { RateAlert } from './entities/rate-alert.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CurrenciesModule } from '../currencies/currencies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateAlert]),
    ExchangeRatesModule,
    NotificationsModule,
    AuditLogsModule,
    CurrenciesModule,
  ],
  controllers: [RateAlertsController],
  providers: [RateAlertsService],
  exports: [RateAlertsService],
})
export class RateAlertsModule {}
