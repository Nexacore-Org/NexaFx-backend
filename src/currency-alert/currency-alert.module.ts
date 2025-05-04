// src/currency-alerts/currency-alerts.module.ts
import { Module } from '@nestjs/common';
import { CurrencyAlertsService } from './currency-alerts.service';
import { CurrencyAlertsController } from './currency-alerts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyAlert } from './entities/currency-alert.entity';
import { CheckAlertsTask } from './tasks/check-alerts.task';
import { NotificationService } from 'src/notifications/notification.service';
import { ExchangeRateService } from 'src/exchange/exchange-rate.service';

@Module({
  imports: [TypeOrmModule.forFeature([CurrencyAlert])],
  controllers: [CurrencyAlertsController],
  providers: [CurrencyAlertsService, CheckAlertsTask, NotificationService, ExchangeRateService],
})
export class CurrencyAlertsModule {}
