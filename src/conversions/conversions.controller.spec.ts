import { Test, TestingModule } from '@nestjs/testing';
import { ConversionsController } from './conversions.controller';
import { ConversionsService } from './conversions.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ConversionsController', () => {
  let controller: ConversionsController;
  let service: jest.Mocked<ConversionsService>;

  beforeEach(async () => {
    const mockService = {
      preview: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversionsController],
      providers: [
        { provide: ConversionsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<ConversionsController>(ConversionsController);
    service = module.get(ConversionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('preview', () => {
    const validPreviewRequest = {
      sourceCurrencyId: 'USD',
      targetCurrencyId: 'EUR',
      amount: 100,
    };

    const expectedPreviewResponse = {
      sourceCurrencyId: 'USD',
      targetCurrencyId: 'EUR',
      amount: 100,
      rate: 1.23,
      fee: 2.5,
      netAmount: 120.5,
      rateLockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      feeBreakdown: [
        { type: 'service', value: 1.5 },
        { type: 'network', value: 1.0 },
      ],
    };

    it('should return a valid preview for positive amount', () => {
      service.preview.mockReturnValue(expectedPreviewResponse);

      const result = controller.preview(validPreviewRequest);

      expect(service.preview).toHaveBeenCalledWith(validPreviewRequest);
      expect(result).toEqual(expectedPreviewResponse);
      expect(result).toHaveProperty('rate');
      expect(result).toHaveProperty('fee');
      expect(result).toHaveProperty('netAmount');
      expect(result).toHaveProperty('rateLockExpiresAt');
      expect(result).toHaveProperty('feeBreakdown');
      expect(result.amount).toBe(100);
      expect(result.sourceCurrencyId).toBe('USD');
      expect(result.targetCurrencyId).toBe('EUR');
    });

    it('should handle preview with rate lock ID', () => {
      const requestWithRateLock = {
        ...validPreviewRequest,
        rateLockId: 'rate-lock-123',
      };

      service.preview.mockReturnValue(expectedPreviewResponse);

      const result = controller.preview(requestWithRateLock);

      expect(service.preview).toHaveBeenCalledWith(requestWithRateLock);
      expect(result).toEqual(expectedPreviewResponse);
    });

    it('should throw HttpException for non-positive amount', () => {
      const invalidRequest = {
        ...validPreviewRequest,
        amount: 0,
      };

      service.preview.mockImplementation(() => {
        throw new HttpException('Amount must be positive', HttpStatus.BAD_REQUEST);
      });

      expect(() => controller.preview(invalidRequest)).toThrow(HttpException);
      expect(() => controller.preview(invalidRequest)).toThrow('Amount must be positive');
    });

    it('should throw HttpException for negative amount', () => {
      const invalidRequest = {
        ...validPreviewRequest,
        amount: -50,
      };

      service.preview.mockImplementation(() => {
        throw new HttpException('Amount must be positive', HttpStatus.BAD_REQUEST);
      });

      expect(() => controller.preview(invalidRequest)).toThrow(HttpException);
    });

    it('should handle expired rate lock error', () => {
      const requestWithExpiredRateLock = {
        ...validPreviewRequest,
        rateLockId: 'expired-rate-lock',
      };

      service.preview.mockImplementation(() => {
        throw new HttpException('Rate lock expired', HttpStatus.BAD_REQUEST);
      });

      expect(() => controller.preview(requestWithExpiredRateLock)).toThrow(HttpException);
      expect(() => controller.preview(requestWithExpiredRateLock)).toThrow('Rate lock expired');
    });

    it('should handle invalid currency error', () => {
      const invalidCurrencyRequest = {
        sourceCurrencyId: 'INVALID',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      service.preview.mockImplementation(() => {
        throw new HttpException('Invalid currency', HttpStatus.BAD_REQUEST);
      });

      expect(() => controller.preview(invalidCurrencyRequest)).toThrow(HttpException);
      expect(() => controller.preview(invalidCurrencyRequest)).toThrow('Invalid currency');
    });

    it('should handle service errors gracefully', () => {
      service.preview.mockImplementation(() => {
        throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
      });

      expect(() => controller.preview(validPreviewRequest)).toThrow(HttpException);
      expect(() => controller.preview(validPreviewRequest)).toThrow('Internal server error');
    });

    it('should validate response structure', () => {
      service.preview.mockReturnValue(expectedPreviewResponse);

      const result = controller.preview(validPreviewRequest);

      // Validate all required properties
      expect(result).toHaveProperty('sourceCurrencyId');
      expect(result).toHaveProperty('targetCurrencyId');
      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('rate');
      expect(result).toHaveProperty('fee');
      expect(result).toHaveProperty('netAmount');
      expect(result).toHaveProperty('rateLockExpiresAt');
      expect(result).toHaveProperty('feeBreakdown');

      // Validate data types
      expect(typeof result.sourceCurrencyId).toBe('string');
      expect(typeof result.targetCurrencyId).toBe('string');
      expect(typeof result.amount).toBe('number');
      expect(typeof result.rate).toBe('number');
      expect(typeof result.fee).toBe('number');
      expect(typeof result.netAmount).toBe('number');
      expect(result.rateLockExpiresAt).toBeInstanceOf(Date);
      expect(Array.isArray(result.feeBreakdown)).toBe(true);

      // Validate fee breakdown structure
      result.feeBreakdown.forEach(fee => {
        expect(fee).toHaveProperty('type');
        expect(fee).toHaveProperty('value');
        expect(typeof fee.type).toBe('string');
        expect(typeof fee.value).toBe('number');
      });
    });

    it('should handle different currency pairs', () => {
      const usdToEurRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      const eurToUsdRequest = {
        sourceCurrencyId: 'EUR',
        targetCurrencyId: 'USD',
        amount: 100,
      };

      const usdToEurResponse = { ...expectedPreviewResponse, rate: 0.85 };
      const eurToUsdResponse = { ...expectedPreviewResponse, rate: 1.18 };

      service.preview
        .mockReturnValueOnce(usdToEurResponse)
        .mockReturnValueOnce(eurToUsdResponse);

      const result1 = controller.preview(usdToEurRequest);
      const result2 = controller.preview(eurToUsdRequest);

      expect(result1.rate).toBe(0.85);
      expect(result2.rate).toBe(1.18);
      expect(service.preview).toHaveBeenCalledTimes(2);
    });

    it('should handle large amounts', () => {
      const largeAmountRequest = {
        ...validPreviewRequest,
        amount: 1000000,
      };

      const largeAmountResponse = {
        ...expectedPreviewResponse,
        amount: 1000000,
        netAmount: 1229997.5,
      };

      service.preview.mockReturnValue(largeAmountResponse);

      const result = controller.preview(largeAmountRequest);

      expect(result.amount).toBe(1000000);
      expect(result.netAmount).toBe(1229997.5);
    });

    it('should handle decimal amounts', () => {
      const decimalAmountRequest = {
        ...validPreviewRequest,
        amount: 99.99,
      };

      const decimalAmountResponse = {
        ...expectedPreviewResponse,
        amount: 99.99,
        netAmount: 120.4877,
      };

      service.preview.mockReturnValue(decimalAmountResponse);

      const result = controller.preview(decimalAmountRequest);

      expect(result.amount).toBe(99.99);
      expect(result.netAmount).toBe(120.4877);
    });
  });
}); 