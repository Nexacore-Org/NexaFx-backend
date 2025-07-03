import { Test, TestingModule } from '@nestjs/testing';
import { ConversionsController } from './conversions.controller';
import { ConversionsService } from './conversions.service';
import { HttpException } from '@nestjs/common';

describe('ConversionsController', () => {
  let controller: ConversionsController;
  let service: ConversionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversionsController],
      providers: [ConversionsService],
    }).compile();

    controller = module.get<ConversionsController>(ConversionsController);
    service = module.get<ConversionsService>(ConversionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return a valid preview for positive amount', () => {
    const dto = {
      sourceCurrencyId: 'USD',
      targetCurrencyId: 'EUR',
      amount: 100,
    };
    const result = controller.preview(dto);
    expect(result).toHaveProperty('rate');
    expect(result).toHaveProperty('fee');
    expect(result).toHaveProperty('netAmount');
    expect(result.amount).toBe(100);
  });

  it('should throw for non-positive amount', () => {
    const dto = {
      sourceCurrencyId: 'USD',
      targetCurrencyId: 'EUR',
      amount: 0,
    };
    expect(() => controller.preview(dto)).toThrow(HttpException);
  });

  // Edge case: expired rate lock (simulate by service override--)
  it('should handle edge case: expired rate lock', () => {
    jest.spyOn(service, 'preview').mockImplementation(() => {
      throw new HttpException('Rate lock expired', 400);
    });
    expect(() => controller.preview({ sourceCurrencyId: 'USD', targetCurrencyId: 'EUR', amount: 100, rateLockId: 'expired' })).toThrow('Rate lock expired');
  });
}); 