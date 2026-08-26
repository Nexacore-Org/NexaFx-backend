import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  RateAlert,
  RateAlertMode,
} from '../rate-alerts/entities/rate-alert.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { WebhookService } from '../webhooks/services/webhook.service';

export interface PercentChangeResult {
  checked: number;
  triggered: number;
}

@Injectable()
export class RateAlertsEnhancementService {
  private readonly logger = new Logger(RateAlertsEnhancementService.name);

  constructor(
    @InjectRepository(RateAlert)
    private readonly rateAlertsRepository: Repository<RateAlert>,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * Evaluate percentage-change alerts.
   * For each active PERCENT_CHANGE alert, fetch the current rate,
   * compare it against the baseline rate stored when the alert was created,
   * and trigger if the absolute percentage change meets or exceeds the threshold.
   */
  async checkPercentChangeAlerts(): Promise<PercentChangeResult> {
    const percentAlerts = await this.rateAlertsRepository.find({
      where: {
        isActive: true,
        alertMode: RateAlertMode.PERCENT_CHANGE,
      },
    });

    if (percentAlerts.length === 0) {
      return { checked: 0, triggered: 0 };
    }

    const rateByPair = new Map<string, Decimal>();
    const uniquePairs = new Set(
      percentAlerts.map((a) => `${a.fromCurrency}|${a.toCurrency}`),
    );

    for (const pair of uniquePairs) {
      const [from, to] = pair.split('|');
      try {
        const result = await this.exchangeRatesService.getRate(from, to);
        // @ts-ignore - Pre-existing type issue
        rateByPair.set(pair, new Decimal(String(result.rate)));
      } catch (err) {
        this.logger.warn(
          `Percent-change alert: failed to fetch rate for ${from}/${to}: ${err}`,
        );
      }
    }

    let triggered = 0;

    for (const alert of percentAlerts) {
      const pair = `${alert.fromCurrency}|${alert.toCurrency}`;
      const currentRate = rateByPair.get(pair);

      if (!currentRate || !alert.baselineRate || !alert.percentThreshold) {
        continue;
      }

      const baseline = new Decimal(alert.baselineRate);
      const threshold = new Decimal(alert.percentThreshold);

      if (baseline.isZero()) {
        continue;
      }

      const percentChange = currentRate
        .minus(baseline)
        .abs()
        .dividedBy(baseline)
        .times(100);

      if (percentChange.greaterThanOrEqualTo(threshold)) {
        await this.triggerPercentChangeAlert(alert, currentRate, percentChange);
        triggered += 1;
      }
    }

    return { checked: percentAlerts.length, triggered };
  }

  private async triggerPercentChangeAlert(
    alert: RateAlert,
    currentRate: Decimal,
    percentChange: Decimal,
  ): Promise<void> {
    const currentRateNum = currentRate.toNumber();
    const percentNum = percentChange.toDecimalPlaces(2).toNumber();
    const now = new Date();

    await this.notificationsService.dispatch(
      alert.userId,
      NotificationType.RATE_ALERT,
      'Rate Alert Triggered',
      `${alert.fromCurrency}/${alert.toCurrency} moved ${percentNum}% (now ${currentRateNum}). Your ${alert.percentThreshold}% threshold alert was triggered.`,
      {
        alertId: alert.id,
        fromCurrency: alert.fromCurrency,
        toCurrency: alert.toCurrency,
        alertMode: alert.alertMode,
        percentThreshold: alert.percentThreshold,
        currentRate: currentRateNum,
        percentChange: percentNum,
        baselineRate: alert.baselineRate,
      },
    );

    await this.rateAlertsRepository
      .createQueryBuilder()
      .update(RateAlert)
      .set({ isActive: false, triggeredAt: now })
      .where('id = :id AND "isActive" = true', { id: alert.id })
      .execute();

    await this.auditLogsService.logSystemEvent(
      AuditAction.RATE_ALERT_TRIGGERED,
      alert.id,
      {
        userId: alert.userId,
        fromCurrency: alert.fromCurrency,
        toCurrency: alert.toCurrency,
        alertMode: alert.alertMode,
        percentThreshold: alert.percentThreshold,
        currentRate: currentRateNum,
        percentChange: percentNum,
        baselineRate: alert.baselineRate,
        triggeredAt: now.toISOString(),
      },
    );

    this.webhookService
      .dispatch('rate_alert.triggered', alert, alert.userId)
      .catch((err) =>
        this.logger.warn(`Webhook dispatch failed for alert ${alert.id}: ${err}`),
      );
  }

  /**
   * Record the current rate as the baseline for a newly created percent-change alert.
   */
  async setBaselineRate(alertId: string, fromCurrency: string, toCurrency: string): Promise<void> {
    try {
      const result = await this.exchangeRatesService.getRate(fromCurrency, toCurrency);
      // @ts-ignore - Pre-existing type issue
      const rate = new Decimal(String(result.rate));

      await this.rateAlertsRepository.update(alertId, {
        baselineRate: rate.toString(),
      });
    } catch (err) {
      this.logger.warn(`Failed to set baseline rate for alert ${alertId}: ${err}`);
    }
  }
}
