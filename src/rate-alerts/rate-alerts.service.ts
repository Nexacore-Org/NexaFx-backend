import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { RateAlert, RateAlertCondition } from './entities/rate-alert.entity';
import { CreateRateAlertDto, RateAlertResponseDto } from './dto';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CurrenciesService } from '../currencies/currencies.service';

export interface RateAlertCheckResult {
  checked: number;
  triggered: number;
  reactivated: number;
}

@Injectable()
export class RateAlertsService {
  private readonly logger = new Logger(RateAlertsService.name);

  constructor(
    @InjectRepository(RateAlert)
    private readonly rateAlertsRepository: Repository<RateAlert>,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly currenciesService: CurrenciesService,
  ) {}

  async createAlert(
    userId: string,
    dto: CreateRateAlertDto,
  ): Promise<RateAlertResponseDto> {
    const fromCurrency = dto.fromCurrency.toUpperCase().trim();
    const toCurrency = dto.toCurrency.toUpperCase().trim();

    if (fromCurrency === toCurrency) {
      throw new BadRequestException(
        'fromCurrency and toCurrency must be different',
      );
    }

    await Promise.all([
      this.currenciesService.validateCurrency(fromCurrency),
      this.currenciesService.validateCurrency(toCurrency),
    ]);

    const alert = this.rateAlertsRepository.create({
      userId,
      fromCurrency,
      toCurrency,
      targetRate: dto.targetRate.toString(),
      condition: dto.condition,
      recurring: dto.recurring ?? false,
      isActive: true,
      triggeredAt: null,
    });

    const saved = await this.rateAlertsRepository.save(alert);

    return this.toResponseDto(saved);
  }

  async getUserAlerts(userId: string): Promise<RateAlertResponseDto[]> {
    const alerts = await this.rateAlertsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return alerts.map((alert) => this.toResponseDto(alert));
  }

  async deleteAlert(userId: string, alertId: string): Promise<void> {
    const alert = await this.rateAlertsRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new NotFoundException('Rate alert not found');
    }

    await this.rateAlertsRepository.delete(alert.id);
  }

  async checkAndTriggerAlerts(): Promise<RateAlertCheckResult> {
    const reactivated = await this.reactivateRecurringAlerts();

    const activeAlerts = await this.rateAlertsRepository.find({
      where: { isActive: true },
    });

    if (activeAlerts.length === 0) {
      return {
        checked: 0,
        triggered: 0,
        reactivated,
      };
    }

    const rateByPair = new Map<string, number>();
    const uniquePairs = new Set(
      activeAlerts.map((alert) => `${alert.fromCurrency}|${alert.toCurrency}`),
    );

    for (const pair of uniquePairs) {
      const [fromCurrency, toCurrency] = pair.split('|');

      try {
        const rateResult = await this.exchangeRatesService.getRate(
          fromCurrency,
          toCurrency,
        );
        rateByPair.set(pair, rateResult.rate);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to fetch rate for ${fromCurrency}/${toCurrency}: ${errorMessage}`,
        );
      }
    }

    let triggered = 0;

    for (const alert of activeAlerts) {
      const pair = `${alert.fromCurrency}|${alert.toCurrency}`;
      const currentRate = rateByPair.get(pair);

      if (currentRate === undefined) {
        continue;
      }

      const targetRate = parseFloat(alert.targetRate);
      const shouldTrigger = this.shouldTriggerAlert(
        alert.condition,
        currentRate,
        targetRate,
      );

      if (!shouldTrigger) {
        continue;
      }

      await this.triggerAlert(alert, currentRate);
      triggered += 1;
    }

    return {
      checked: activeAlerts.length,
      triggered,
      reactivated,
    };
  }

  private shouldTriggerAlert(
    condition: RateAlertCondition,
    currentRate: number,
    targetRate: number,
  ): boolean {
    if (condition === RateAlertCondition.ABOVE) {
      return currentRate >= targetRate;
    }

    return currentRate <= targetRate;
  }

  private async triggerAlert(
    alert: RateAlert,
    currentRate: number,
  ): Promise<void> {
    const now = new Date();

    await this.notificationsService.create({
      userId: alert.userId,
      type: NotificationType.SYSTEM,
      title: 'Rate Alert Triggered',
      message: `${alert.fromCurrency}/${alert.toCurrency} is now ${currentRate}. Your ${alert.condition} ${alert.targetRate} alert was triggered.`,
      relatedId: alert.id,
      metadata: {
        alertId: alert.id,
        fromCurrency: alert.fromCurrency,
        toCurrency: alert.toCurrency,
        condition: alert.condition,
        targetRate: alert.targetRate,
        currentRate,
        recurring: alert.recurring,
      },
    });

    alert.isActive = false;
    alert.triggeredAt = now;
    await this.rateAlertsRepository.save(alert);

    await this.auditLogsService.logSystemEvent(
      AuditAction.RATE_ALERT_TRIGGERED,
      alert.id,
      {
        userId: alert.userId,
        fromCurrency: alert.fromCurrency,
        toCurrency: alert.toCurrency,
        condition: alert.condition,
        targetRate: alert.targetRate,
        currentRate,
        recurring: alert.recurring,
        triggeredAt: now.toISOString(),
      },
    );
  }

  private async reactivateRecurringAlerts(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recurringAlerts = await this.rateAlertsRepository.find({
      where: {
        recurring: true,
        isActive: false,
        triggeredAt: LessThanOrEqual(cutoff),
      },
    });

    if (recurringAlerts.length === 0) {
      return 0;
    }

    recurringAlerts.forEach((alert) => {
      alert.isActive = true;
    });

    await this.rateAlertsRepository.save(recurringAlerts);

    return recurringAlerts.length;
  }

  private toResponseDto(alert: RateAlert): RateAlertResponseDto {
    return {
      id: alert.id,
      userId: alert.userId,
      fromCurrency: alert.fromCurrency,
      toCurrency: alert.toCurrency,
      targetRate: alert.targetRate,
      condition: alert.condition,
      isActive: alert.isActive,
      recurring: alert.recurring,
      triggeredAt: alert.triggeredAt,
      createdAt: alert.createdAt,
    };
  }
}
