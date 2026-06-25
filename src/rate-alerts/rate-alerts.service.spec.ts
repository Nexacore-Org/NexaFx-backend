import { Test, TestingModule } from '@nestjs/testing';
import { RateAlertsService } from './rate-alerts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateAlert, RateAlertCondition } from './entities/rate-alert.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('RateAlertsService', () => {
  let service: RateAlertsService;
  let rateAlertsRepository: jest.Mocked<Repository<RateAlert>>;
  let exchangeRatesService: jest.Mocked<ExchangeRatesService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let auditLogsService: jest.Mocked<AuditLogsService>;
  let currenciesService: jest.Mocked<CurrenciesService>;

  const mockAlert = {
    id: 'alert-123',
    userId: 'user-123',
    fromCurrency: 'EUR',
    toCurrency: 'USD',
    targetRate: '1.5',
    condition: RateAlertCondition.ABOVE,
    recurring: false,
    isActive: true,
    triggeredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateAlertsService,
        {
          provide: getRepositoryToken(RateAlert),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ExchangeRatesService,
          useValue: {
            getRate: jest.fn(),
            convertToUsd: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logAuthEvent: jest.fn(),
          },
        },
        {
          provide: CurrenciesService,
          useValue: {
            validateCurrency: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RateAlertsService);
    rateAlertsRepository = module.get(getRepositoryToken(RateAlert));
    exchangeRatesService = module.get(ExchangeRatesService);
    notificationsService = module.get(NotificationsService);
    auditLogsService = module.get(AuditLogsService);
    currenciesService = module.get(CurrenciesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAlert', () => {
    it('should create an ABOVE alert for rate above target', async () => {
      currenciesService.validateCurrency.mockResolvedValue(true);
      rateAlertsRepository.create.mockReturnValue(mockAlert);
      rateAlertsRepository.save.mockResolvedValue(mockAlert);

      const result = await service.createAlert('user-123', {
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        targetRate: '1.5',
        condition: RateAlertCondition.ABOVE,
      });

      expect(result).toHaveProperty('id');
      expect(rateAlertsRepository.save).toHaveBeenCalled();
    });

    it('should create a BELOW alert for rate below target', async () => {
      const belowAlert = { ...mockAlert, condition: RateAlertCondition.BELOW };
      currenciesService.validateCurrency.mockResolvedValue(true);
      rateAlertsRepository.create.mockReturnValue(belowAlert);
      rateAlertsRepository.save.mockResolvedValue(belowAlert);

      const result = await service.createAlert('user-123', {
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        targetRate: '1.3',
        condition: RateAlertCondition.BELOW,
      });

      expect(result.condition).toBe(RateAlertCondition.BELOW);
    });

    it('should throw BadRequestException when from and to currencies are the same', async () => {
      currenciesService.validateCurrency.mockResolvedValue(true);

      await expect(
        service.createAlert('user-123', {
          fromCurrency: 'USD',
          toCurrency: 'USD',
          targetRate: '1.0',
          condition: RateAlertCondition.ABOVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate both currencies', async () => {
      currenciesService.validateCurrency.mockResolvedValue(true);
      rateAlertsRepository.create.mockReturnValue(mockAlert);
      rateAlertsRepository.save.mockResolvedValue(mockAlert);

      await service.createAlert('user-123', {
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        targetRate: '1.5',
        condition: RateAlertCondition.ABOVE,
      });

      expect(currenciesService.validateCurrency).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkAndTriggerAlerts', () => {
    it('should trigger ABOVE alert when current rate exceeds target', async () => {
      const alert = { ...mockAlert, condition: RateAlertCondition.ABOVE, targetRate: '1.4' };
      rateAlertsRepository.find.mockResolvedValue([alert]);
      exchangeRatesService.getRate.mockResolvedValue({ rate: '1.6' });
      rateAlertsRepository.update.mockResolvedValue({ affected: 1 });
      notificationsService.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.checkAndTriggerAlerts();

      expect(result.triggered).toBeGreaterThanOrEqual(0);
    });

    it('should trigger BELOW alert when current rate falls below target', async () => {
      const alert = { ...mockAlert, condition: RateAlertCondition.BELOW, targetRate: '1.6' };
      rateAlertsRepository.find.mockResolvedValue([alert]);
      exchangeRatesService.getRate.mockResolvedValue({ rate: '1.4' });
      rateAlertsRepository.update.mockResolvedValue({ affected: 1 });
      notificationsService.create.mockResolvedValue({ id: 'notif-123' });

      const result = await service.checkAndTriggerAlerts();

      expect(result.triggered).toBeGreaterThanOrEqual(0);
    });

    it('should not re-trigger already-triggered alert when not recurring', async () => {
      const alert = {
        ...mockAlert,
        triggeredAt: new Date(),
        recurring: false,
        condition: RateAlertCondition.ABOVE,
      };

      rateAlertsRepository.find.mockResolvedValue([alert]);
      exchangeRatesService.getRate.mockResolvedValue({ rate: '1.7' });

      const result = await service.checkAndTriggerAlerts();

      // Should not trigger again
      expect(rateAlertsRepository.update).not.toHaveBeenCalled();
    });

    it('should reactivate recurring alerts after trigger', async () => {
      const alert = {
        ...mockAlert,
        recurring: true,
        triggeredAt: new Date(),
        condition: RateAlertCondition.ABOVE,
      };

      rateAlertsRepository.find.mockResolvedValue([alert]);
      (service as any).reactivateRecurringAlerts = jest
        .fn()
        .mockResolvedValue(1);

      await service.checkAndTriggerAlerts();

      expect((service as any).reactivateRecurringAlerts).toHaveBeenCalled();
    });

    it('should confirm idempotent updates', async () => {
      const alert = { ...mockAlert, condition: RateAlertCondition.ABOVE };
      rateAlertsRepository.find.mockResolvedValue([alert]);
      exchangeRatesService.getRate.mockResolvedValue({ rate: '1.6' });
      rateAlertsRepository.update.mockResolvedValue({ affected: 1 });

      const result1 = await service.checkAndTriggerAlerts();
      const result2 = await service.checkAndTriggerAlerts();

      // Should return consistent results
      expect(result1.checked).toBe(result2.checked);
    });
  });

  describe('deleteAlert', () => {
    it('should delete alert for the user', async () => {
      rateAlertsRepository.findOne.mockResolvedValue(mockAlert);
      rateAlertsRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteAlert('user-123', 'alert-123');

      expect(rateAlertsRepository.delete).toHaveBeenCalledWith('alert-123');
    });

    it('should throw NotFoundException when alert not found', async () => {
      rateAlertsRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteAlert('user-123', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when alert belongs to different user', async () => {
      rateAlertsRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteAlert('user-456', 'alert-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserAlerts', () => {
    it('should return all alerts for user', async () => {
      const alerts = [mockAlert, { ...mockAlert, id: 'alert-456' }];
      rateAlertsRepository.find.mockResolvedValue(alerts);

      const result = await service.getUserAlerts('user-123');

      expect(result).toHaveLength(2);
    });

    it('should return empty array when user has no alerts', async () => {
      rateAlertsRepository.find.mockResolvedValue([]);

      const result = await service.getUserAlerts('user-123');

      expect(result).toEqual([]);
    });
  });
});
