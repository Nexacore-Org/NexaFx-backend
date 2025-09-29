import { Test, TestingModule } from '@nestjs/testing';
import { RatesService } from './rates.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('RatesService', () => {
  let service: RatesService;
  const currenciesService = { findOne: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue(0.005) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatesService,
        { provide: CurrenciesService, useValue: currenciesService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<RatesService>(RatesService);
  });

  it('calculates rate, fee, and netAmount correctly', async () => {
    currenciesService.findOne
      .mockResolvedValueOnce({ exchangeRate: 2 })
      .mockResolvedValueOnce({ exchangeRate: 4 });

    const result = await service.getRate({
      source: 'SRC',
      target: 'TGT',
      amount: 5,
    });
    const expectedRate = 4 / 2;
    const gross = 5 * expectedRate;
    const expectedFee = gross * 0.005;

    expect(result.rate).toBe(expectedRate);
    expect(result.fee).toBeCloseTo(expectedFee, 5);
    expect(result.netAmount).toBeCloseTo(gross - expectedFee, 5);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('defaults amount to 1', async () => {
    currenciesService.findOne
      .mockResolvedValueOnce({ exchangeRate: 10 })
      .mockResolvedValueOnce({ exchangeRate: 20 });

    const result = await service.getRate({ source: 'SRC', target: 'TGT' });
    expect(result.rate).toBe(20 / 10);
  });

  it('throws if source and target are the same', async () => {
    await expect(
      service.getRate({ source: 'USD', target: 'usd', amount: 1 }),
    ).rejects.toThrow(/Source and target currencies must be different/);
  });

  it('throws if amount is invalid', async () => {
    currenciesService.findOne.mockResolvedValue({ exchangeRate: 1 });
    await expect(
      service.getRate({ source: 'USD', target: 'EUR', amount: 0 }),
    ).rejects.toThrow(/Amount must be a positive number/);
    await expect(
      service.getRate({ source: 'USD', target: 'EUR', amount: -5 }),
    ).rejects.toThrow(/Amount must be a positive number/);
    await expect(
      service.getRate({ source: 'USD', target: 'EUR', amount: NaN }),
    ).rejects.toThrow(/Amount must be a positive number/);
  });

  it('is case-insensitive for currency codes', async () => {
    currenciesService.findOne.mockImplementation((code) => {
      if (code === 'USD') return Promise.resolve({ exchangeRate: 2 });
      if (code === 'NGN') return Promise.resolve({ exchangeRate: 10 });
      return Promise.resolve(null);
    });
    const result = await service.getRate({
      source: 'usd',
      target: 'ngn',
      amount: 1,
    });
    expect(result.rate).toBe(10 / 2);
  });

  it('throws for unsupported source currency', async () => {
    currenciesService.findOne.mockImplementation((code) => {
      if (code === 'USD') return Promise.resolve({ exchangeRate: 2 });
      return Promise.resolve(null);
    });
    await expect(
      service.getRate({ source: 'XXX', target: 'USD', amount: 1 }),
    ).rejects.toThrow(/Unsupported source currency: XXX/);
  });

  it('throws for unsupported target currency', async () => {
    currenciesService.findOne.mockImplementation((code) => {
      if (code === 'USD') return Promise.resolve({ exchangeRate: 2 });
      return Promise.resolve(null);
    });
    await expect(
      service.getRate({ source: 'USD', target: 'YYY', amount: 1 }),
    ).rejects.toThrow(/Unsupported target currency: YYY/);
  });

  it('throws if exchangeRate missing', async () => {
    currenciesService.findOne
      .mockResolvedValueOnce({ exchangeRate: null })
      .mockResolvedValueOnce({ exchangeRate: 1 });

    await expect(
      service.getRate({ source: 'SRC', target: 'TGT' }),
    ).rejects.toThrow(BadRequestException);
  });
});
