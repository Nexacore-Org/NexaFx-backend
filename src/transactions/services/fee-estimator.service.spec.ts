import { FeeTransactionType, FeeType } from '../../fees/entities/fee-config.entity';
import { FeesService } from '../../fees/fees.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { RedisService } from '../../modules/redis/redis.service';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { FeeEstimatorService } from './fee-estimator.service';
import { Repository } from 'typeorm';

describe('FeeEstimatorService', () => {
  let service: FeeEstimatorService;
  let feesService: { calculateFee: jest.Mock };
  let exchangeRatesService: { getFreshRate: jest.Mock };
  let redisService: { key: jest.Mock; setJson: jest.Mock; getJson: jest.Mock };

  beforeEach(() => {
    feesService = {
      calculateFee: jest.fn(async (_type, currency) => ({
        feeAmount: 2,
        feeCurrency: currency,
        feeType: FeeType.PERCENTAGE,
        feeValue: '1.25',
      })),
    };
    exchangeRatesService = {
      getFreshRate: jest.fn(async () => ({ rate: 2 })),
    };
    redisService = {
      key: jest.fn((...parts: string[]) => parts.join(':')),
      setJson: jest.fn(async () => undefined),
      getJson: jest.fn(async () => null),
    };

    service = new FeeEstimatorService(
      {} as unknown as Repository<Transaction>,
      feesService as never as FeesService,
      exchangeRatesService as never as ExchangeRatesService,
      {} as never,
      redisService as never as RedisService,
    );
  });

  it('estimates only configured fees and converts swap output using the fresh rate', async () => {
    const result = await service.estimateTransaction('user-1', {
      type: TransactionType.SWAP,
      amount: 100,
      currency: 'xlm',
      toCurrency: 'usdc',
    });

    expect(exchangeRatesService.getFreshRate).toHaveBeenCalledWith(
      'XLM',
      'USDC',
    );
    expect(result.toAmount).toBe('200.00000000');
    expect(result.exchangeRate).toBe(2);
    expect(result.fees.platformFee).toEqual({
      amount: '2.00000000',
      currency: 'XLM',
      percent: '1.25',
    });
    expect(result.fees.networkFee.amount).toBe('0.00000000');
    expect(result.fees.markupFee.amount).toBe('0.00000000');
    expect(result.totalDeducted).toBe('102.00000000');
  });

  it('applies conversion markup below market rate and charges the configured fee once', async () => {
    feesService.calculateFee.mockResolvedValueOnce({
      feeAmount: 0.5,
      feeCurrency: 'USDC',
      feeType: FeeType.PERCENTAGE,
      feeValue: '0.25',
    });

    const result = await service.estimateConversion('user-1', {
      fromCurrency: 'XLM',
      toCurrency: 'USDC',
      fromAmount: 100,
    });

    expect(result.exchangeRate).toBeLessThan(2);
    expect(result.exchangeRate).toBe(1.993);
    expect(feesService.calculateFee).toHaveBeenCalledWith(
      FeeTransactionType.CONVERT,
      'USDC',
      199.3,
    );
    expect(result.fees.conversionFee.amount).toBe('0.50000000');
    expect(result.fees.conversionFee.percent).toBe('0.25');
    expect(result.fees.platformFee.amount).toBe('0.00000000');
    expect(result.fees.total.amount).toBe('0.50000000');
    expect(result.toAmount).toBe('198.80000000');
  });
});
