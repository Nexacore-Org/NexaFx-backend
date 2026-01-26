import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrenciesService } from '../currencies/currencies.service';
import { ExchangeRatesService } from './exchange-rates.service';
import {
  ExchangeRatesProviderClient,
  ExchangeRatesProviderError,
} from './providers/exchange-rates.provider';
import { ExchangeRatesCache } from './cache/exchange-rates.cache';
import { ConfigService } from '@nestjs/config';

describe('ExchangeRatesService', () => {
  let service: ExchangeRatesService;
  let providerClient: ExchangeRatesProviderClient;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'EXCHANGE_RATES_CACHE_TTL_SECONDS') return '600';
      if (key === 'EXCHANGE_RATES_CACHE_MAX_SIZE') return '100';
      return undefined;
    }),
  };

  const mockCurrenciesService = {
    validateCurrency: jest.fn(),
  };

  const mockProviderClient = {
    fetchRate: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    const cache = new ExchangeRatesCache(mockConfigService as ConfigService);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRatesService,
        {
          provide: CurrenciesService,
          useValue: mockCurrenciesService,
        },
        {
          provide: ExchangeRatesProviderClient,
          useValue: mockProviderClient,
        },
        {
          provide: ExchangeRatesCache,
          useValue: cache,
        },
      ],
    }).compile();

    service = module.get<ExchangeRatesService>(ExchangeRatesService);
    providerClient = module.get<ExchangeRatesProviderClient>(
      ExchangeRatesProviderClient,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRate', () => {
    it('should throw BadRequestException for invalid currency', async () => {
      mockCurrenciesService.validateCurrency.mockRejectedValue(
        new NotFoundException("Currency 'XYZ' is not supported or inactive"),
      );

      await expect(service.getRate('XYZ', 'USD')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('should cache provider results within TTL', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      mockProviderClient.fetchRate.mockResolvedValue({
        rate: 2,
        fetchedAt: new Date('2026-01-26T00:00:00.000Z').toISOString(),
        source: 'test',
      });

      jest.setSystemTime(new Date('2026-01-26T00:00:00.000Z'));

      const first = await service.getRate('NGN', 'USD');
      const second = await service.getRate('NGN', 'USD');

      expect(first.rate).toBe(2);
      expect(second.rate).toBe(2);
      expect(providerClient.fetchRate).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after TTL expires', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      mockProviderClient.fetchRate.mockResolvedValue({
        rate: 2,
        fetchedAt: new Date('2026-01-26T00:00:00.000Z').toISOString(),
        source: 'test',
      });

      const baseTime = new Date('2026-01-26T00:00:00.000Z');
      jest.setSystemTime(baseTime);
      await service.getRate('NGN', 'USD');

      jest.setSystemTime(new Date(baseTime.getTime() + 601000));
      await service.getRate('NGN', 'USD');

      expect(providerClient.fetchRate).toHaveBeenCalledTimes(2);
    });

    it('should map provider errors to BadGatewayException', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      mockProviderClient.fetchRate.mockRejectedValue(
        new ExchangeRatesProviderError('Provider down'),
      );

      await expect(service.getRate('NGN', 'USD')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('convert', () => {
    it('should convert amount using fetched rate', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      mockProviderClient.fetchRate.mockResolvedValue({
        rate: 1.5,
        fetchedAt: new Date('2026-01-26T00:00:00.000Z').toISOString(),
        source: 'test',
      });

      const result = await service.convert('NGN', 'USD', 10);

      expect(result.rate).toBe(1.5);
      expect(result.convertedAmount).toBe(15);
    });

    it('should reject invalid amount values', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);

      await expect(
        service.convert('NGN', 'USD', Number.NaN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
