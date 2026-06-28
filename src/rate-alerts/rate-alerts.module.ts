import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateAlertsController } from './rate-alerts.controller';
import { RateAlertsService } from './rate-alerts.service';
import { RateAlert } from './entities/rate-alert.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateAlert]),
    ExchangeRatesModule,
    NotificationsModule,
    AuditLogsModule,
    CurrenciesModule,
    WebhooksModule,
  ],
  controllers: [RateAlertsController],
  providers: [RateAlertsService],
  exports: [RateAlertsService],
})
export class RateAlertsModule {}
