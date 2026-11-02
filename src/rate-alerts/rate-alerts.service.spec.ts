jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const tokenFor = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(tokenFor(entity)),
    getRepositoryToken: tokenFor,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiTags: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
}));

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: () => () => undefined,
  WebSocketServer: () => () => undefined,
  SubscribeMessage: () => () => undefined,
}));

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));

jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000000',
}));

jest.mock(
  '@nestjs/bull',
  () => ({
    InjectQueue: () => () => undefined,
    Process: () => () => undefined,
    Processor: () => () => undefined,
  }),
  { virtual: true },
);

jest.mock('bull', () => ({ Queue: class Queue {} }), { virtual: true });

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
  Processor: () => () => undefined,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { RateAlertsService } from './rate-alerts.service';
import { RateAlert, RateAlertCondition } from './entities/rate-alert.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CurrenciesService } from '../currencies/currencies.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { ActivityFeedType } from '../unified-activity-feed/entities/activity-feed-item.entity';

describe('RateAlertsService', () => {
  let service: RateAlertsService;
  let callOrder: string[];

  const mockUpdateQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  const mockRateAlertsRepository = {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn((data) => Promise.resolve(data)),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => mockUpdateQueryBuilder),
  };

  const mockExchangeRatesService = {
    getRate: jest.fn(),
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockAuditLogsService = {
    logSystemEvent: jest.fn(),
  };

  const mockCurrenciesService = {
    validateCurrency: jest.fn(),
  };

  const mockWebhookService = {
    dispatch: jest.fn(),
  };

  const mockActivityFeedService = {
    append: jest.fn(),
  };

  const makeAlert = (overrides: Partial<RateAlert> = {}): RateAlert =>
    ({
      id: 'alert-1',
      userId: 'user-1',
      fromCurrency: 'USD',
      toCurrency: 'NGN',
      targetRate: '1500',
      condition: RateAlertCondition.ABOVE,
      isActive: true,
      recurring: false,
      triggeredAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    }) as RateAlert;

  beforeEach(async () => {
    jest.clearAllMocks();
    callOrder = [];

    mockUpdateQueryBuilder.update.mockReturnThis();
    mockUpdateQueryBuilder.set.mockReturnThis();
    mockUpdateQueryBuilder.where.mockReturnThis();
    mockUpdateQueryBuilder.execute.mockImplementation(async () => {
      callOrder.push('claim_update');
      return { affected: 1 };
    });

    mockNotificationsService.dispatch.mockImplementation(async () => {
      callOrder.push('notification_dispatch');
      return {};
    });

    mockActivityFeedService.append.mockImplementation(async () => {
      callOrder.push('activity_feed_append');
      return {};
    });

    mockAuditLogsService.logSystemEvent.mockImplementation(async () => {
      callOrder.push('audit_log');
      return {};
    });

    mockWebhookService.dispatch.mockImplementation(async () => {
      callOrder.push('webhook_dispatch');
      return {};
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateAlertsService,
        {
          provide: getRepositoryToken(RateAlert),
          useValue: mockRateAlertsRepository,
        },
        {
          provide: ExchangeRatesService,
          useValue: mockExchangeRatesService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: AuditLogsService,
          useValue: mockAuditLogsService,
        },
        {
          provide: CurrenciesService,
          useValue: mockCurrenciesService,
        },
        {
          provide: WebhookService,
          useValue: mockWebhookService,
        },
        {
          provide: UnifiedActivityFeedService,
          useValue: mockActivityFeedService,
        },
      ],
    }).compile();

    service = module.get<RateAlertsService>(RateAlertsService);
  });

  describe('checkAndTriggerAlerts', () => {
    it('claims the alert atomically before dispatching notifications, feed, audit, and webhook when triggered', async () => {
      const alert = makeAlert({
        id: 'alert-above',
        condition: RateAlertCondition.ABOVE,
        targetRate: '999',
      });

      mockRateAlertsRepository.find
        .mockResolvedValueOnce([]) // reactivateRecurringAlerts
        .mockResolvedValueOnce([alert]); // activeAlerts

      mockExchangeRatesService.getRate.mockResolvedValue({
        from: 'USD',
        to: 'NGN',
        rate: 1500,
      });

      const result = await service.checkAndTriggerAlerts();

      expect(result).toEqual({
        checked: 1,
        triggered: 1,
        reactivated: 0,
      });

      expect(mockUpdateQueryBuilder.where).toHaveBeenCalledWith(
        'id = :id AND "isActive" = true',
        { id: 'alert-above' },
      );
      expect(callOrder[0]).toBe('claim_update');
      expect(callOrder).toEqual([
        'claim_update',
        'notification_dispatch',
        'activity_feed_append',
        'audit_log',
        'webhook_dispatch',
      ]);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        'user-1',
        NotificationType.RATE_ALERT_TRIGGERED,
        'Rate Alert Triggered',
        expect.stringContaining('USD/NGN is now 1500'),
        expect.objectContaining({
          alertId: 'alert-above',
          currentRate: 1500,
        }),
      );
      expect(mockActivityFeedService.append).toHaveBeenCalledWith(
        'user-1',
        ActivityFeedType.RATE_ALERT_TRIGGER,
        'alert-above',
        'RateAlert',
      );
      expect(mockAuditLogsService.logSystemEvent).toHaveBeenCalledWith(
        AuditAction.RATE_ALERT_TRIGGERED,
        'alert-above',
        expect.objectContaining({
          userId: 'user-1',
          currentRate: 1500,
        }),
      );
    });

    it('does not trigger or claim when the current rate does not satisfy the alert condition', async () => {
      const alert = makeAlert({
        condition: RateAlertCondition.ABOVE,
        targetRate: '1600',
      });

      mockRateAlertsRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([alert]);

      mockExchangeRatesService.getRate.mockResolvedValue({
        from: 'USD',
        to: 'NGN',
        rate: 1500,
      });

      const result = await service.checkAndTriggerAlerts();

      expect(result).toEqual({
        checked: 1,
        triggered: 0,
        reactivated: 0,
      });
      expect(mockUpdateQueryBuilder.execute).not.toHaveBeenCalled();
      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('does not call notificationsService.dispatch when the conditional UPDATE affects 0 rows (claim lost)', async () => {
      const alert = makeAlert({
        id: 'alert-race',
        condition: RateAlertCondition.BELOW,
        targetRate: '10',
      });

      mockRateAlertsRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([alert]);

      mockExchangeRatesService.getRate.mockResolvedValue({
        from: 'USD',
        to: 'NGN',
        rate: 5,
      });

      mockUpdateQueryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

      const result = await service.checkAndTriggerAlerts();

      expect(result).toEqual({
        checked: 1,
        triggered: 0,
        reactivated: 0,
      });
      expect(mockUpdateQueryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
      expect(mockActivityFeedService.append).not.toHaveBeenCalled();
      expect(mockAuditLogsService.logSystemEvent).not.toHaveBeenCalled();
      expect(mockWebhookService.dispatch).not.toHaveBeenCalled();
    });

    it('reactivates recurring alerts whose cooldown has elapsed before evaluating active alerts', async () => {
      const expiredRecurring = makeAlert({
        id: 'alert-recurring',
        recurring: true,
        isActive: false,
        triggeredAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      mockRateAlertsRepository.find
        .mockResolvedValueOnce([expiredRecurring]) // reactivateRecurringAlerts
        .mockResolvedValueOnce([]); // activeAlerts

      const result = await service.checkAndTriggerAlerts();

      expect(result).toEqual({
        checked: 0,
        triggered: 0,
        reactivated: 1,
      });
      expect(expiredRecurring.isActive).toBe(true);
      expect(mockRateAlertsRepository.save).toHaveBeenCalledWith([
        expiredRecurring,
      ]);
    });
  });

  describe('Decimal comparison edge cases', () => {
    it('evaluates numeric magnitudes accurately with Decimal instead of lexicographic string comparison', () => {
      expect('1500' > '999').toBe(false);
      expect(new Decimal('1500').greaterThanOrEqualTo(new Decimal('999'))).toBe(
        true,
      );
      expect(new Decimal('0.6').greaterThanOrEqualTo(new Decimal('0.5'))).toBe(
        true,
      );
    });
  });
});
