import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { RateAlert, RateAlertDirection } from './entities/rate-alert.entity';
import { CreateRateAlertDto } from './dto/create-rate-alert.dto';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';
import { FirebaseService } from '../firebase/firebase.service';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateAlertsService {
  private readonly logger = new Logger(RateAlertsService.name);

  constructor(
    @InjectRepository(RateAlert)
    private readonly alertsRepo: Repository<RateAlert>,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly firebaseService: FirebaseService,
    private readonly configService: ConfigService,
  ) {}

  async create(userId: string, dto: CreateRateAlertDto) {
    const alert = this.alertsRepo.create({
      userId,
      fromCurrency: dto.fromCurrency.toUpperCase(),
      toCurrency: dto.toCurrency.toUpperCase(),
      targetRate: dto.targetRate,
      direction: dto.direction,
      isActive: dto.isActive ?? true,
      isTriggered: false,
      triggeredAt: null,
    });

    return this.alertsRepo.save(alert);
  }

  async listByUser(userId: string, page = 1, limit = 25) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.alertsRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async delete(userId: string, id: string) {
    const alert = await this.alertsRepo.findOne({ where: { id } });
    if (!alert) throw new BadRequestException('Alert not found');
    if (alert.userId !== userId) throw new BadRequestException('Unauthorized');
    await this.alertsRepo.delete(id);
    return { deleted: true };
  }

  async reset(userId: string, id: string) {
    const alert = await this.alertsRepo.findOne({ where: { id } });
    if (!alert) throw new BadRequestException('Alert not found');
    if (alert.userId !== userId) throw new BadRequestException('Unauthorized');

    alert.isTriggered = false;
    alert.triggeredAt = null;
    await this.alertsRepo.save(alert);
    return alert;
  }

  /**
   * Fetch active & untriggered alerts, group by pair, fetch rate once per pair,
   * evaluate using Decimal.js and trigger alerts atomically.
   */
  async checkAndTriggerAlerts(): Promise<{
    checked: number;
    triggered: number;
    reactivated: number;
  }> {
    const alerts = await this.alertsRepo.find({
      where: { isActive: true, isTriggered: false },
    });

    if (alerts.length === 0) return { checked: 0, triggered: 0, reactivated: 0 };

    // group by pair
    const groups = new Map<string, RateAlert[]>();
    for (const a of alerts) {
      const key = `${a.fromCurrency.toUpperCase()}_${a.toCurrency.toUpperCase()}`;
      const arr = groups.get(key) ?? [];
      arr.push(a);
      groups.set(key, arr);
    }

    let triggered = 0;
    let checked = 0;
    let reactivated = 0;

    for (const [key, group] of groups.entries()) {
      const [from, to] = key.split('_');
      let rateResult;
      try {
        rateResult = await this.exchangeRatesService.getRate(from, to);
      } catch (err) {
        this.logger.warn(`Failed to fetch rate for ${from}->${to}: ${err}`);
        continue;
      }

      const current = new Decimal(rateResult.rate);
      checked += group.length;

      for (const alert of group) {
        const target = new Decimal(alert.targetRate);
        let shouldTrigger = false;

        if (alert.direction === RateAlertDirection.ABOVE) {
          if (current.gt(target)) shouldTrigger = true;
        } else {
          if (current.lt(target)) shouldTrigger = true;
        }

        if (!shouldTrigger) continue;

        // Attempt atomic update to prevent double-triggers
        const updateResult = await this.alertsRepo
          .createQueryBuilder()
          .update(RateAlert)
          .set({ isTriggered: true, triggeredAt: () => 'CURRENT_TIMESTAMP' })
          .where('id = :id AND isTriggered = false', { id: alert.id })
          .execute();

        if ((updateResult.affected ?? 0) === 0) {
          // someone else triggered it concurrently
          continue;
        }

        triggered += 1;

        // Dispatch notifications: in-app, push (FCM), email
        try {
          // In-app
          await this.notificationsService.create({
            userId: alert.userId,
            type: NotificationType.SYSTEM,
            title: `Rate alert triggered: ${alert.fromCurrency}/${alert.toCurrency}`,
            message: `Target ${alert.direction} ${alert.targetRate} reached. Current rate: ${rateResult.rate}`,
            relatedId: alert.id,
            metadata: {
              from: alert.fromCurrency,
              to: alert.toCurrency,
              targetRate: alert.targetRate,
              direction: alert.direction,
              currentRate: rateResult.rate,
            },
          });
        } catch (e) {
          this.logger.warn(`Failed to create in-app notification for ${alert.userId}: ${e}`);
        }

        try {
          // Push - fetch user tokens and send
          const user = await this.usersService.findById(alert.userId as any);
          const tokens = (user && (user.fcmTokens || [])) as string[];
          if (tokens.length > 0) {
            await this.firebaseService.sendToTokens(
              tokens,
              `Rate alert: ${alert.fromCurrency}/${alert.toCurrency}`,
              `Target ${alert.direction} ${alert.targetRate} reached. Current: ${rateResult.rate}`,
              {
                alertId: alert.id,
                from: alert.fromCurrency,
                to: alert.toCurrency,
                current: String(rateResult.rate),
              },
            );
          }
        } catch (e) {
          this.logger.warn(`Failed to send push for ${alert.userId}: ${e}`);
        }

        try {
          // Email via Mailgun (best-effort)
          const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
          const domain = this.configService.get<string>('MAILGUN_DOMAIN');
          const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');

          if (apiKey && domain && fromEmail) {
            const mailgun = new Mailgun(FormData);
            const client = mailgun.client({ username: 'api', key: apiKey });
            const user = await this.usersService.findById(alert.userId as any);
            if (user?.email) {
              await client.messages.create(domain, {
                from: fromEmail,
                to: [user.email],
                subject: `Rate alert triggered: ${alert.fromCurrency}/${alert.toCurrency}`,
                text: `Your rate alert for ${alert.fromCurrency}/${alert.toCurrency} (${alert.direction} ${alert.targetRate}) was triggered. Current rate: ${rateResult.rate}`,
              });
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to send email for ${alert.userId}: ${e}`);
        }
      }
    }

    return { checked, triggered, reactivated };
  }
}
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
    const uniquePairs: Set<string> = new Set(
      activeAlerts.map((alert) => `${alert.fromCurrency}|${alert.toCurrency}`),
    );

    for (const pair of uniquePairs) {
      const [fromCurrency, toCurrency] = pair.split('|');

      try {
        const rateResult = await this.exchangeRatesService.getRate(
          fromCurrency,
          toCurrency,
        );
        // @ts-ignore - Pre-existing type issue
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
