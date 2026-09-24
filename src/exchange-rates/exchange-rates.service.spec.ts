import {
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CurrenciesService } from '../currencies/currencies.service';
import { ExchangeRatesService } from './exchange-rates.service';
import {
  ExchangeRatesProviderClient,
  ExchangeRatesProviderError,
} from './providers/exchange-rates.provider';
import { ExchangeRateSnapshot } from './entities/exchange-rate-snapshot.entity';

describe('ExchangeRatesService', () => {
  let service: ExchangeRatesService;
  let providerClient: ExchangeRatesProviderClient;
  let cacheManager: any;
  let snapshotRepository: any;

  const mockCurrenciesService = {
    validateCurrency: jest.fn(),
  };

  const mockProviderClient = {
    fetchRate: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockSnapshotRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn().mockResolvedValue({}),
    find: jest.fn(),
  };

  beforeEach(async () => {
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
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: getRepositoryToken(ExchangeRateSnapshot),
          useValue: mockSnapshotRepository,
        },
      ],
    }).compile();

    service = module.get<ExchangeRatesService>(ExchangeRatesService);
    providerClient = module.get<ExchangeRatesProviderClient>(
      ExchangeRatesProviderClient,
    );
    cacheManager = module.get(CACHE_MANAGER);
    snapshotRepository = module.get(getRepositoryToken(ExchangeRateSnapshot));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRate', () => {
    it('should throw BadRequestException if currency validation fails', async () => {
      mockCurrenciesService.validateCurrency.mockRejectedValue(
        new Error("Currency 'XYZ' is not supported"),
      );

      await expect(service.getRate('XYZ', 'USD')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return valid cached rates without calling provider', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      const futureExpiry = new Date(Date.now() + 30000).toISOString();
      mockCacheManager.get.mockResolvedValue({
        from: 'XLM',
        to: 'NGN',
        rate: 250,
        inverseRate: 0.004,
        provider: 'coingecko',
        cachedAt: new Date().toISOString(),
        expiresAt: futureExpiry,
      });

      const result = await service.getRate('XLM', 'NGN');

      expect(result.rate).toBe(250);
      expect(result.stale).toBeUndefined();
      expect(providerClient.fetchRate).not.toHaveBeenCalled();
    });

    it('should call provider and update cache if cache is expired', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      const pastExpiry = new Date(Date.now() - 5000).toISOString();
      mockCacheManager.get.mockResolvedValue({
        from: 'XLM',
        to: 'NGN',
        rate: 240,
        inverseRate: 0.0041,
        provider: 'coingecko',
        cachedAt: new Date().toISOString(),
        expiresAt: pastExpiry,
      });

      mockProviderClient.fetchRate.mockResolvedValue({
        rate: 260,
        fetchedAt: new Date().toISOString(),
        source: 'coingecko',
      });

      const result = await service.getRate('XLM', 'NGN');

      expect(result.rate).toBe(260);
      expect(providerClient.fetchRate).toHaveBeenCalledWith('XLM', 'NGN');
      expect(cacheManager.set).toHaveBeenCalled();
      expect(snapshotRepository.save).toHaveBeenCalled();
    });

    it('should fall back to stale cache with stale:true if provider fails', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      const pastExpiry = new Date(Date.now() - 5000).toISOString();
      const cached = {
        from: 'XLM',
        to: 'NGN',
        rate: 240,
        inverseRate: 0.0041,
        provider: 'coingecko',
        cachedAt: new Date().toISOString(),
        expiresAt: pastExpiry,
      };
      mockCacheManager.get.mockResolvedValue(cached);
      mockProviderClient.fetchRate.mockRejectedValue(
        new ExchangeRatesProviderError('API Limit reached'),
      );

      const result = await service.getRate('XLM', 'NGN');

      expect(result.rate).toBe(240);
      expect(result.stale).toBe(true);
    });

    it('should throw ServiceUnavailableException if provider fails and no cache exists', async () => {
      mockCurrenciesService.validateCurrency.mockResolvedValue(undefined);
      mockCacheManager.get.mockResolvedValue(null);
      mockProviderClient.fetchRate.mockRejectedValue(
        new ExchangeRatesProviderError('CoinGecko down'),
      );

      await expect(service.getRate('XLM', 'NGN')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getDailyOHLCHistory', () => {
    it('should correctly aggregate snapshots into daily OHLC data', async () => {
      const mockSnapshots = [
        { rate: '100.00000000', timestamp: new Date('2026-06-24T10:00:00Z') },
        { rate: '105.00000000', timestamp: new Date('2026-06-24T11:00:00Z') },
        { rate: '95.00000000', timestamp: new Date('2026-06-24T12:00:00Z') },
        { rate: '102.00000000', timestamp: new Date('2026-06-24T13:00:00Z') },
      ];
      mockSnapshotRepository.find.mockResolvedValue(mockSnapshots);

      const result = await service.getDailyOHLCHistory('XLM', 'NGN', 7);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        date: '2026-06-24',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
      });
    });
  });
});
