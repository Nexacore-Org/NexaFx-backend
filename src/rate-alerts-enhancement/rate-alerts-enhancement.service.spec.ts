import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateAlertsEnhancementService } from './rate-alerts-enhancement.service';
import {
  RateAlert,
  RateAlertMode,
  RateAlertCondition,
} from '../rate-alerts/entities/rate-alert.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WebhookService } from '../webhooks/services/webhook.service';

describe('RateAlertsEnhancementService', () => {
  let service: RateAlertsEnhancementService;
  let rateAlertsRepo: Repository<RateAlert>;
  let exchangeRatesService: ExchangeRatesService;

  const mockRateAlert: Partial<RateAlert> = {
    id: 'test-id',
    userId: 'user-id',
    fromCurrency: 'XLM',
    toCurrency: 'USD',
    targetRate: '0.10',
    condition: RateAlertCondition.ABOVE,
    isActive: true,
    alertMode: RateAlertMode.PERCENT_CHANGE,
    percentThreshold: '5.00',
    baselineRate: '0.10',
    recurring: false,
    triggeredAt: null,
  };

  const mockRepository = {
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    }),
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

  const mockWebhookService = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateAlertsEnhancementService,
        { provide: getRepositoryToken(RateAlert), useValue: mockRepository },
        { provide: ExchangeRatesService, useValue: mockExchangeRatesService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    service = module.get<RateAlertsEnhancementService>(
      RateAlertsEnhancementService,
    );
    rateAlertsRepo = module.get(getRepositoryToken(RateAlert));
    exchangeRatesService = module.get(ExchangeRatesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkPercentChangeAlerts', () => {
    it('should return 0 checked when no percent-change alerts exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.checkPercentChangeAlerts();

      expect(result).toEqual({ checked: 0, triggered: 0 });
    });

    it('should trigger alert when percent change meets threshold', async () => {
      mockRepository.find.mockResolvedValue([mockRateAlert]);
      mockExchangeRatesService.getRate.mockResolvedValue({ rate: '0.15' });

      const result = await service.checkPercentChangeAlerts();

      expect(result.triggered).toBe(1);
      expect(mockNotificationsService.dispatch).toHaveBeenCalled();
    });

    it('should not trigger alert when percent change is below threshold', async () => {
      const alertBelow = {
        ...mockRateAlert,
        percentThreshold: '10.00',
        baselineRate: '0.10',
      };
      mockRepository.find.mockResolvedValue([alertBelow]);
      mockExchangeRatesService.getRate.mockResolvedValue({ rate: '0.105' });

      const result = await service.checkPercentChangeAlerts();

      expect(result.triggered).toBe(0);
      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should handle rate fetch failures gracefully', async () => {
      mockRepository.find.mockResolvedValue([mockRateAlert]);
      mockExchangeRatesService.getRate.mockRejectedValue(
        new Error('Rate unavailable'),
      );

      const result = await service.checkPercentChangeAlerts();

      expect(result.checked).toBe(1);
      expect(result.triggered).toBe(0);
    });

    it('should skip alerts without baseline rate', async () => {
      const alertNoBaseline = {
        ...mockRateAlert,
        baselineRate: null,
      };
      mockRepository.find.mockResolvedValue([alertNoBaseline]);
      mockExchangeRatesService.getRate.mockResolvedValue({ rate: '0.15' });

      const result = await service.checkPercentChangeAlerts();

      expect(result.triggered).toBe(0);
    });

    it('should calculate percentage change correctly', async () => {
      const alert = {
        ...mockRateAlert,
        baselineRate: '0.10',
        percentThreshold: '5.00',
      };
      mockRepository.find.mockResolvedValue([alert]);
      mockExchangeRatesService.getRate.mockResolvedValue({ rate: '0.105' });

      const result = await service.checkPercentChangeAlerts();

      // 0.105 vs 0.10 = 5% change, meets 5% threshold
      expect(result.triggered).toBe(1);
    });
  });
});
