import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateAlertsEnhancementController } from './rate-alerts-enhancement.controller';
import { RateAlertsEnhancementService } from './rate-alerts-enhancement.service';
import { RateAlert } from '../rate-alerts/entities/rate-alert.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateAlert]),
    ExchangeRatesModule,
    NotificationsModule,
    AuditLogsModule,
    WebhooksModule,
  ],
  controllers: [RateAlertsEnhancementController],
  providers: [RateAlertsEnhancementService],
  exports: [RateAlertsEnhancementService],
})
export class RateAlertsEnhancementModule {}
