import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeRateResolver } from './exchange-rate.resolver';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { CurrenciesService } from '../../currencies/currencies.service';

describe('ExchangeRateResolver', () => {
  let resolver: ExchangeRateResolver;
  let exchangeRatesService: jest.Mocked<ExchangeRatesService>;
  let currenciesService: jest.Mocked<CurrenciesService>;

  const mockCurrencies = [
    {
      id: 'curr-uuid-1',
      code: 'NGN',
      name: 'Nigerian Naira',
      symbol: '₦',
      decimals: 2,
      isBase: true,
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'curr-uuid-2',
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimals: 2,
      isBase: false,
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateResolver,
        {
          provide: ExchangeRatesService,
          useValue: {
            getRate: jest.fn(),
          },
        },
        {
          provide: CurrenciesService,
          useValue: {
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<ExchangeRateResolver>(ExchangeRateResolver);
    exchangeRatesService = module.get(ExchangeRatesService);
    currenciesService = module.get(CurrenciesService);
  });

  describe('exchangeRate', () => {
    it('returns rate with timestamp for a valid currency pair', async () => {
      const fetchedAt = '2024-01-01T00:00:00.000Z';
      exchangeRatesService.getRate.mockResolvedValue({
        from: 'XLM',
        to: 'USD',
        rate: 0.1234,
        fetchedAt,
      });

      const result = await resolver.exchangeRate('XLM', 'USD');

      expect(exchangeRatesService.getRate).toHaveBeenCalledWith('XLM', 'USD');
      expect(result).toEqual({
        from: 'XLM',
        to: 'USD',
        rate: 0.1234,
        timestamp: fetchedAt,
      });
    });

    it('falls back to current time when fetchedAt is absent', async () => {
      exchangeRatesService.getRate.mockResolvedValue({
        from: 'XLM',
        to: 'USD',
        rate: 0.09,
      });

      const result = await resolver.exchangeRate('XLM', 'USD');

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
    });

    it('propagates BadRequestException for unsupported currency pairs', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      exchangeRatesService.getRate.mockRejectedValue(
        new BadRequestException("Currency 'XYZ' is not supported"),
      );

      await expect(resolver.exchangeRate('XYZ', 'USD')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('currencies', () => {
    it('returns all active currencies', async () => {
      currenciesService.findAll.mockResolvedValue(mockCurrencies as any);

      const result = await resolver.currencies();

      expect(currenciesService.findAll).toHaveBeenCalledWith();
      expect(result).toEqual(mockCurrencies);
      expect(result).toHaveLength(2);
    });

    it('returns an empty array when no currencies exist', async () => {
      currenciesService.findAll.mockResolvedValue([]);

      const result = await resolver.currencies();

      expect(result).toEqual([]);
    });
  });
});
