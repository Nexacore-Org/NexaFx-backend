import { Test, TestingModule } from '@nestjs/testing';
import { ConversionsService } from './conversions.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ConversionsService', () => {
  let service: ConversionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConversionsService],
    }).compile();

    service = module.get<ConversionsService>(ConversionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('preview', () => {
    const validInput = {
      sourceCurrencyId: 'USD',
      targetCurrencyId: 'EUR',
      amount: 100,
    };

    it('should return a valid preview for positive amount', () => {
      const result = service.preview(validInput);

      expect(result).toHaveProperty('sourceCurrencyId', 'USD');
      expect(result).toHaveProperty('targetCurrencyId', 'EUR');
      expect(result).toHaveProperty('amount', 100);
      expect(result).toHaveProperty('rate');
      expect(result).toHaveProperty('fee');
      expect(result).toHaveProperty('netAmount');
      expect(result).toHaveProperty('rateLockExpiresAt');
      expect(result).toHaveProperty('feeBreakdown');

      // Validate data types
      expect(typeof result.rate).toBe('number');
      expect(typeof result.fee).toBe('number');
      expect(typeof result.netAmount).toBe('number');
      expect(result.rateLockExpiresAt).toBeInstanceOf(Date);
      expect(Array.isArray(result.feeBreakdown)).toBe(true);

      // Validate calculations
      expect(result.netAmount).toBe(result.amount * result.rate - result.fee);
      expect(result.feeBreakdown.reduce((sum, fee) => sum + fee.value, 0)).toBe(
        result.fee,
      );
    });

    it('should handle preview with rate lock ID', () => {
      const inputWithRateLock = {
        ...validInput,
        rateLockId: 'rate-lock-123',
      };

      const result = service.preview(inputWithRateLock);

      expect(result).toHaveProperty('sourceCurrencyId', 'USD');
      expect(result).toHaveProperty('targetCurrencyId', 'EUR');
      expect(result).toHaveProperty('amount', 100);
      expect(result).toHaveProperty('rateLockExpiresAt');
      expect(result.rateLockExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw HttpException for zero amount', () => {
      const invalidInput = {
        ...validInput,
        amount: 0,
      };

      expect(() => service.preview(invalidInput)).toThrow(HttpException);
      expect(() => service.preview(invalidInput)).toThrow(
        'Amount must be positive',
      );
    });

    it('should throw HttpException for negative amount', () => {
      const invalidInput = {
        ...validInput,
        amount: -50,
      };

      expect(() => service.preview(invalidInput)).toThrow(HttpException);
      expect(() => service.preview(invalidInput)).toThrow(
        'Amount must be positive',
      );
    });

    it('should throw HttpException for very small negative amount', () => {
      const invalidInput = {
        ...validInput,
        amount: -0.01,
      };

      expect(() => service.preview(invalidInput)).toThrow(HttpException);
      expect(() => service.preview(invalidInput)).toThrow(
        'Amount must be positive',
      );
    });

    it('should handle different currency pairs', () => {
      const usdToEurInput = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      const eurToUsdInput = {
        sourceCurrencyId: 'EUR',
        targetCurrencyId: 'USD',
        amount: 100,
      };

      const result1 = service.preview(usdToEurInput);
      const result2 = service.preview(eurToUsdInput);

      expect(result1.sourceCurrencyId).toBe('USD');
      expect(result1.targetCurrencyId).toBe('EUR');
      expect(result2.sourceCurrencyId).toBe('EUR');
      expect(result2.targetCurrencyId).toBe('USD');
    });

    it('should handle large amounts', () => {
      const largeAmountInput = {
        ...validInput,
        amount: 1000000,
      };

      const result = service.preview(largeAmountInput);

      expect(result.amount).toBe(1000000);
      expect(result.netAmount).toBe(result.amount * result.rate - result.fee);
      expect(result.netAmount).toBeGreaterThan(0);
    });

    it('should handle decimal amounts', () => {
      const decimalAmountInput = {
        ...validInput,
        amount: 99.99,
      };

      const result = service.preview(decimalAmountInput);

      expect(result.amount).toBe(99.99);
      expect(result.netAmount).toBe(result.amount * result.rate - result.fee);
    });

    it('should handle very small amounts', () => {
      const smallAmountInput = {
        ...validInput,
        amount: 0.01,
      };

      const result = service.preview(smallAmountInput);

      expect(result.amount).toBe(0.01);
      expect(result.netAmount).toBe(result.amount * result.rate - result.fee);
    });

    it('should validate fee breakdown structure', () => {
      const result = service.preview(validInput);

      expect(Array.isArray(result.feeBreakdown)).toBe(true);
      expect(result.feeBreakdown.length).toBeGreaterThan(0);

      result.feeBreakdown.forEach((fee) => {
        expect(fee).toHaveProperty('type');
        expect(fee).toHaveProperty('value');
        expect(typeof fee.type).toBe('string');
        expect(typeof fee.value).toBe('number');
        expect(fee.value).toBeGreaterThanOrEqual(0);
      });

      // Validate total fee matches breakdown
      const totalFee = result.feeBreakdown.reduce(
        (sum, fee) => sum + fee.value,
        0,
      );
      expect(totalFee).toBe(result.fee);
    });

    it('should validate rate lock expiration time', () => {
      const result = service.preview(validInput);

      expect(result.rateLockExpiresAt).toBeInstanceOf(Date);
      expect(result.rateLockExpiresAt.getTime()).toBeGreaterThan(Date.now());

      // Rate lock should expire in the future (within reasonable time)
      const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
      expect(result.rateLockExpiresAt.getTime()).toBeLessThanOrEqual(
        fiveMinutesFromNow + 1000,
      ); // Allow 1 second tolerance
    });

    it('should maintain consistent rate for same input', () => {
      const result1 = service.preview(validInput);
      const result2 = service.preview(validInput);

      expect(result1.rate).toBe(result2.rate);
      expect(result1.fee).toBe(result2.fee);
    });

    it('should handle edge case with maximum safe number', () => {
      const maxSafeInput = {
        ...validInput,
        amount: Number.MAX_SAFE_INTEGER,
      };

      const result = service.preview(maxSafeInput);

      expect(result.amount).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.netAmount).toBe(result.amount * result.rate - result.fee);
      expect(isFinite(result.netAmount)).toBe(true);
    });

    it('should handle different currency IDs', () => {
      const cryptoInput = {
        sourceCurrencyId: 'BTC',
        targetCurrencyId: 'ETH',
        amount: 1,
      };

      const fiatInput = {
        sourceCurrencyId: 'NGN',
        targetCurrencyId: 'USD',
        amount: 1000,
      };

      const cryptoResult = service.preview(cryptoInput);
      const fiatResult = service.preview(fiatInput);

      expect(cryptoResult.sourceCurrencyId).toBe('BTC');
      expect(cryptoResult.targetCurrencyId).toBe('ETH');
      expect(fiatResult.sourceCurrencyId).toBe('NGN');
      expect(fiatResult.targetCurrencyId).toBe('USD');
    });

    it('should validate net amount calculation', () => {
      const result = service.preview(validInput);

      const expectedNetAmount = result.amount * result.rate - result.fee;
      expect(result.netAmount).toBe(expectedNetAmount);
    });

    it('should handle rate lock ID with special characters', () => {
      const specialRateLockInput = {
        ...validInput,
        rateLockId: 'rate-lock-123-abc_xyz',
      };

      const result = service.preview(specialRateLockInput);

      expect(result).toHaveProperty('sourceCurrencyId', 'USD');
      expect(result).toHaveProperty('targetCurrencyId', 'EUR');
      expect(result).toHaveProperty('amount', 100);
    });

    it('should handle empty rate lock ID', () => {
      const emptyRateLockInput = {
        ...validInput,
        rateLockId: '',
      };

      const result = service.preview(emptyRateLockInput);

      expect(result).toHaveProperty('sourceCurrencyId', 'USD');
      expect(result).toHaveProperty('targetCurrencyId', 'EUR');
      expect(result).toHaveProperty('amount', 100);
    });
  });
});
