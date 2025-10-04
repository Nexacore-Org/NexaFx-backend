import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import axios, { AxiosResponse } from 'axios';
import { RateFetcherService } from './rate-fetcher.service';
import { Currency } from '../entities/currency.entity';
import { CurrencyType } from '../enum/currencyType.enum';
import { SchedulerRegistry } from '@nestjs/schedule';

// Mock axios
jest.mock('axios');
jest.mock('axios-retry');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock axios.create to return proper axios instance structure
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn(),
      eject: jest.fn(),
    },
    response: {
      use: jest.fn(),
      eject: jest.fn(),
    },
  },
  defaults: {},
};

mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

describe('RateFetcherService', () => {
  let service: RateFetcherService;
  let repository: Repository<Currency>;
  let configService: ConfigService;
  let schedulerRegistry: SchedulerRegistry;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, any> = {
        API_TIMEOUT: 5000,
        API_MAX_RETRIES: 3,
        OPENEXCHANGERATES_API_KEY: 'test-key-123',
        COINGECKO_API_KEY: 'test-key-456',
        EXCHANGERATE_API_KEY: 'test-key-789',
        NODE_ENV: 'test',
      };
      return config[key];
    }),
  };

  const mockSchedulerRegistry = {
    getCronJob: jest.fn(),
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateFetcherService,
        {
          provide: getRepositoryToken(Currency),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
        },
      ],
    }).compile();

    service = module.get<RateFetcherService>(RateFetcherService);
    repository = module.get<Repository<Currency>>(getRepositoryToken(Currency));
    configService = module.get<ConfigService>(ConfigService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);

    // Reset mocks before each test
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockedAxios);
    mockedAxios.interceptors = {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    } as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentRate', () => {
    it('should return rate for existing currency', async () => {
      const mockCurrency = {
        code: 'USD',
        rate: 1.0,
        type: CurrencyType.FIAT,
      };

      mockRepository.findOne.mockResolvedValue(mockCurrency);

      const result = await service.getCurrentRate('USD');
      expect(result).toBe(1.0);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should return null for non-existent currency', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getCurrentRate('INVALID');
      expect(result).toBeNull();
    });
  });

  describe('convertCurrency', () => {
    it('should convert between currencies correctly', async () => {
      const fromCurrency = { code: 'USD', rate: 1.0, type: CurrencyType.FIAT };
      const toCurrency = { code: 'EUR', rate: 0.85, type: CurrencyType.FIAT };

      mockRepository.findOne
        .mockResolvedValueOnce(fromCurrency)
        .mockResolvedValueOnce(toCurrency);

      const result = await service.convertCurrency(100, 'USD', 'EUR');

      expect(result).toBeCloseTo(85, 2); // 100 * (0.85 / 1.0) = 85
      expect(mockRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it('should handle conversion when from currency has different rate', async () => {
      const fromCurrency = { code: 'EUR', rate: 0.85, type: CurrencyType.FIAT };
      const toCurrency = { code: 'GBP', rate: 0.73, type: CurrencyType.FIAT };

      mockRepository.findOne
        .mockResolvedValueOnce(fromCurrency)
        .mockResolvedValueOnce(toCurrency);

      const result = await service.convertCurrency(100, 'EUR', 'GBP');

      expect(result).toBeCloseTo(85.88, 2); // 100 * (0.73 / 0.85) ≈ 85.88
    });

    it('should return null for non-existent currencies', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.convertCurrency(100, 'INVALID', 'USD');
      expect(result).toBeNull();
    });
  });

  describe('getAllCurrentRates', () => {
    it('should return all current rates', async () => {
      const mockCurrencies = [
        { code: 'USD', rate: 1.0, type: CurrencyType.FIAT },
        { code: 'EUR', rate: 0.85, type: CurrencyType.FIAT },
        { code: 'BTC', rate: 45000, type: CurrencyType.CRYPTO },
      ];

      mockRepository.find.mockResolvedValue(mockCurrencies);

      const result = await service.getAllCurrentRates();

      expect(result).toEqual({
        USD: 1.0,
        EUR: 0.85,
        BTC: 45000,
      });
    });

    it('should return empty object when no currencies found', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getAllCurrentRates();

      expect(result).toEqual({});
    });
  });

  describe('Health Check and Monitoring', () => {
    it('should return comprehensive health check', async () => {
      const health = await service.healthCheck();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('apiStatus');
      expect(health).toHaveProperty('circuitBreakers');
      expect(health).toHaveProperty('lastUpdate');
      expect(health).toHaveProperty('fallbackRatesCount');

      expect(Array.isArray(health.apiStatus)).toBe(true);
      expect(Array.isArray(health.circuitBreakers)).toBe(true);
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    it('should return API health status', async () => {
      const healthStatus = service.getApiHealthStatus();

      expect(Array.isArray(healthStatus)).toBe(true);
      healthStatus.forEach((status) => {
        expect(status).toHaveProperty('provider');
        expect(status).toHaveProperty('isHealthy');
        expect(status).toHaveProperty('lastCheck');
        expect(status).toHaveProperty('errorCount');
        expect(status).toHaveProperty('consecutiveFailures');
      });
    });

    it('should return circuit breaker status', async () => {
      const circuitBreakerStatus = service.getCircuitBreakerStatus();

      expect(Array.isArray(circuitBreakerStatus)).toBe(true);
      circuitBreakerStatus.forEach((status) => {
        expect(status).toHaveProperty('provider');
        expect(status).toHaveProperty('isOpen');
      });
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should reset circuit breaker for valid provider', () => {
      expect(() =>
        service.resetCircuitBreaker('OpenExchangeRates'),
      ).not.toThrow();
    });

    it('should reset circuit breaker for CoinGecko', () => {
      expect(() =>
        service.resetCircuitBreaker('CoinGecko'),
      ).not.toThrow();
    });

    it('should reset circuit breaker for ExchangeRateAPI', () => {
      expect(() =>
        service.resetCircuitBreaker('ExchangeRateAPI'),
      ).not.toThrow();
    });

    it('should throw error for invalid provider', () => {
      expect(() =>
        service.resetCircuitBreaker('InvalidProvider'),
      ).toThrow('Circuit breaker not found for provider');
    });
  });

  describe('Fallback Rates', () => {
    it('should return cached fallback rates', () => {
      const fallbackRates = service.getFallbackRates();

      expect(Array.isArray(fallbackRates)).toBe(true);
      fallbackRates.forEach((rate) => {
        expect(rate).toHaveProperty('code');
        expect(rate).toHaveProperty('rate');
        expect(rate).toHaveProperty('source');
        expect(rate).toHaveProperty('timestamp');
      });
    });

    it('should handle empty fallback rates', () => {
      const fallbackRates = service.getFallbackRates();

      expect(Array.isArray(fallbackRates)).toBe(true);
      // Could be empty if no fallback rates have been cached yet
    });
  });

  describe('Rate Update Mechanism', () => {
    beforeEach(() => {
      mockRepository.find.mockResolvedValue([
        { code: 'USD', rate: 1.0, type: CurrencyType.FIAT },
        { code: 'EUR', rate: 0.85, type: CurrencyType.FIAT },
        { code: 'BTC', rate: 45000, type: CurrencyType.CRYPTO },
      ]);
    });

    it('should call updateRates without throwing', async () => {
      mockRepository.save.mockResolvedValue({});

      await expect(service.updateRates()).resolves.not.toThrow();
    });

    it('should handle errors in updateRates gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.updateRates()).resolves.not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('Configuration and Environment', () => {
    it('should handle test environment configuration', () => {
      expect(mockConfigService.get('NODE_ENV')).toBe('test');
      expect(mockConfigService.get('OPENEXCHANGERATES_API_KEY')).toBe(
        'test-key-123',
      );
      expect(mockConfigService.get('COINGECKO_API_KEY')).toBe('test-key-456');
    });

    it('should initialize with proper timeout and retry configuration', () => {
      expect(mockConfigService.get('API_TIMEOUT')).toBe(5000);
      expect(mockConfigService.get('API_MAX_RETRIES')).toBe(3);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle API errors during rate updates', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock axios to throw errors
      mockedAxios.get.mockRejectedValue(new Error('Network error'));
      mockRepository.save.mockResolvedValue({});

      await service.updateRates();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle specific 403 errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const error403 = {
        response: {
          status: 403,
          statusText: 'Forbidden',
          data: { message: 'Invalid API key' },
        },
        config: { url: 'https://openexchangerates.org/api/latest.json' },
      };

      mockedAxios.get.mockRejectedValue(error403);
      mockRepository.save.mockResolvedValue({});

      await service.updateRates();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle rate limiting (429) errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const error429 = {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' },
        },
        config: { url: 'https://openexchangerates.org/api/latest.json' },
      };

      mockedAxios.get.mockRejectedValue(error429);
      mockRepository.save.mockResolvedValue({});

      await service.updateRates();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Currency Operations', () => {
    it('should handle missing rate data gracefully', async () => {
      const currencyWithoutRate = {
        code: 'TEST',
        rate: null,
        type: CurrencyType.FIAT,
      };

      mockRepository.findOne.mockResolvedValue(currencyWithoutRate);

      const result = await service.getCurrentRate('TEST');
      expect(result).toBeNull();
    });

    it('should handle conversion with zero rates', async () => {
      const fromCurrency = { code: 'USD', rate: 0, type: CurrencyType.FIAT };
      const toCurrency = { code: 'EUR', rate: 0.85, type: CurrencyType.FIAT };

      mockRepository.findOne
        .mockResolvedValueOnce(fromCurrency)
        .mockResolvedValueOnce(toCurrency);

      const result = await service.convertCurrency(100, 'USD', 'EUR');
      expect(result).toBeNull();
    });
  });

  describe('Module Initialization', () => {
    it('should initialize properly', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.onModuleInit();

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should handle initialization errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockRepository.find.mockRejectedValue(new Error('Database error'));

      await service.onModuleInit();

      consoleSpy.mockRestore();
    });
  });

  describe('Performance and Resilience', () => {
    it('should handle concurrent rate requests', async () => {
      const mockCurrency = {
        code: 'USD',
        rate: 1.0,
        type: CurrencyType.FIAT,
      };

      mockRepository.findOne.mockResolvedValue(mockCurrency);

      const promises = Array(10)
        .fill(null)
        .map(() => service.getCurrentRate('USD'));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every((result) => result === 1.0)).toBe(true);
    });

    it('should handle large amount conversions', async () => {
      const fromCurrency = { code: 'USD', rate: 1.0, type: CurrencyType.FIAT };
      const toCurrency = { code: 'EUR', rate: 0.85, type: CurrencyType.FIAT };

      mockRepository.findOne
        .mockResolvedValueOnce(fromCurrency)
        .mockResolvedValueOnce(toCurrency);

      const largeAmount = 1000000;
      const result = await service.convertCurrency(largeAmount, 'USD', 'EUR');

      expect(result).toBe(largeAmount * 0.85);
    });
  });
});
