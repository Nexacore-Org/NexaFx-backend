// src/currency-alerts/tasks/check-alerts.task.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CurrencyAlertsService } from '../currency-alerts.service';
import { AlertDirection } from '../dto/alert-direction.enum';
import { NotificationService } from 'src/notifications/notification.service';
import { ExchangeRateService } from 'src/exchange/exchange-rate.service'; // hypothetical

@Injectable()
export class CheckAlertsTask {
  constructor(
    private readonly alertService: CurrencyAlertsService,
    private readonly notificationService: NotificationService,
    private readonly rateService: ExchangeRateService,
  ) {}

  @Cron('*/5 * * * *') // every 5 minutes
  async handleCron() {
    const alerts = await this.alertService.getPendingAlerts();

    for (const alert of alerts) {
      const currentRate = await this.rateService.getRate(alert.baseCurrency, alert.targetCurrency);
      const shouldNotify =
        (alert.direction === AlertDirection.ABOVE && currentRate > +alert.thresholdRate) ||
        (alert.direction === AlertDirection.BELOW && currentRate < +alert.thresholdRate);

      if (shouldNotify) {
        await this.notificationService.sendCurrencyAlert(alert.userId, {
          baseCurrency: alert.baseCurrency,
          targetCurrency: alert.targetCurrency,
          rate: currentRate,
          direction: alert.direction,
        });

        await this.alertService.markAsNotified(alert.id);
      }
    }
  }
}
