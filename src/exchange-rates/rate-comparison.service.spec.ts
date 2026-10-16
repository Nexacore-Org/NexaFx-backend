import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { FeesService } from '../fees/fees.service';
import { FeeTransactionType } from '../fees/entities/fee-config.entity';
import { ExchangeRatesService } from './exchange-rates.service';
import { RateComparisonService } from './rate-comparison.service';
import { of } from 'rxjs';

describe('RateComparisonService', () => {
  let service: RateComparisonService;

  const exchangeRatesService = {
    getRate: jest.fn().mockResolvedValue({ rate: 2 }),
  };
  const httpService = {
    get: jest.fn().mockReturnValue(of({ data: [] })),
  };
  const cacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const feesService = {
    calculateFee: jest.fn().mockResolvedValue({
      feeAmount: 0.5,
      feeCurrency: 'NGN',
      feeType: 'PERCENTAGE',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateComparisonService,
        { provide: ExchangeRatesService, useValue: exchangeRatesService },
        { provide: HttpService, useValue: httpService },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: FeesService, useValue: feesService },
      ],
    }).compile();

    service = module.get(RateComparisonService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    exchangeRatesService.getRate.mockResolvedValue({ rate: 2 });
    httpService.get.mockReturnValue(of({ data: [] }));
    cacheManager.get.mockResolvedValue(undefined);
    feesService.calculateFee.mockResolvedValue({
      feeAmount: 0.5,
      feeCurrency: 'NGN',
      feeType: 'PERCENTAGE',
    });
  });

  it('uses the configured CONVERT fee for the destination amount', async () => {
    const result = await service.compare('EUR', 'NGN', 10);

    expect(feesService.calculateFee).toHaveBeenCalledWith(
      FeeTransactionType.CONVERT,
      'NGN',
      20,
    );
    expect(result.nexafx.fee).toBe(0.5);
    expect(result.nexafx.youReceive).toBe(19.5);
  });

  it('does not use CBN for non-USD sources or scrape Google Finance', async () => {
    await service.compare('EUR', 'NGN', 10);

    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(httpService.get.mock.calls[0][0]).toContain('api.wise.com');
    expect(httpService.get.mock.calls[0][0]).not.toContain('cbn.gov.ng');
    expect(httpService.get.mock.calls[0][0]).not.toContain('google.com');
  });

  it('uses CBN only for USD to NGN comparisons', async () => {
    httpService.get.mockImplementation((url: string) =>
      of({
        data: url.includes('cbn.gov.ng')
          ? [{ currency: 'USD', rate: '1500' }]
          : [{ rate: 1490 }],
      }),
    );

    const result = await service.compare('USD', 'NGN', 1);

    expect(result.competitors).toContainEqual({
      provider: 'Central Bank (CBN)',
      rate: 1500,
      fee: 0,
      youReceive: 1500,
    });
  });
});
