import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversionsService } from './conversions.service';
import { Currency } from '../currencies/entities/currency.entity';
import { BadRequestException } from '@nestjs/common';

describe('ConversionsService', () => {
  let service: ConversionsService;
  let currencyRepository: Repository<Currency>;

  const mockCurrencyRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionsService,
        {
          provide: getRepositoryToken(Currency),
          useValue: mockCurrencyRepository,
        },
      ],
    }).compile();

    service = module.get<ConversionsService>(ConversionsService);
    currencyRepository = module.get<Repository<Currency>>(getRepositoryToken(Currency));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('simulateConversion', () => {
    const mockUsdCurrency: Partial<Currency> = {
      code: 'USD',
      rate: 1,
      type: 'FIAT',
    };

    const mockBtcCurrency: Partial<Currency> = {
      code: 'BTC',
      rate: 40000,
      type: 'CRYPTO',
    };

    it('should calculate conversion correctly for USD to BTC', async () => {
      mockCurrencyRepository.findOne
        .mockResolvedValueOnce(mockUsdCurrency)
        .mockResolvedValueOnce(mockBtcCurrency);

      const result = await service.simulateConversion({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 1000,
      });

      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('BTC');
      expect(result.inputAmount).toBe(1000);
      expect(result.exchangeRate).toBe(40000);
      expect(result.fees.percentage).toBe(0.3); // 0.2% base + 0.1% crypto
      expect(result.rateLockExpiresAt).toBeDefined();
    });

    it('should apply correct fee tiers based on amount', async () => {
      mockCurrencyRepository.findOne
        .mockResolvedValueOnce(mockUsdCurrency)
        .mockResolvedValueOnce(mockBtcCurrency);

      // Test small amount (< 1000)
      const smallResult = await service.simulateConversion({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 500,
      });
      expect(smallResult.fees.percentage).toBe(0.6); // 0.5% base + 0.1% crypto

      // Test medium amount (>= 1000)
      const mediumResult = await service.simulateConversion({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 5000,
      });
      expect(mediumResult.fees.percentage).toBe(0.3); // 0.2% base + 0.1% crypto

      // Test large amount (>= 10000)
      const largeResult = await service.simulateConversion({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 15000,
      });
      expect(largeResult.fees.percentage).toBe(0.2); // 0.1% base + 0.1% crypto
    });

    it('should throw BadRequestException when currency not found', async () => {
      mockCurrencyRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.simulateConversion({
          fromCurrency: 'INVALID',
          toCurrency: 'BTC',
          amount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when rate not available', async () => {
      mockCurrencyRepository.findOne
        .mockResolvedValueOnce({ ...mockUsdCurrency, rate: null })
        .mockResolvedValueOnce(mockBtcCurrency);

      await expect(
        service.simulateConversion({
          fromCurrency: 'USD',
          toCurrency: 'BTC',
          amount: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should maintain rate lock for subsequent requests', async () => {
      mockCurrencyRepository.findOne
        .mockResolvedValueOnce(mockUsdCurrency)
        .mockResolvedValueOnce(mockBtcCurrency);

      const firstResult = await service.simulateConversion({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 1000,
      });

      const secondResult = await service.simulateConversion({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 1000,
      });

      expect(firstResult.exchangeRate).toBe(secondResult.exchangeRate);
      expect(firstResult.rateLockExpiresAt).toBe(secondResult.rateLockExpiresAt);
    });
  });
}); 