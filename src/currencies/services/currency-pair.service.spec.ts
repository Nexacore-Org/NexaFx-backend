import { BadRequestException } from '@nestjs/common';
import { CurrencyPairService } from './currency-pair.service';

describe('CurrencyPairService admin payloads', () => {
  let repository: any;
  let service: CurrencyPairService;

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(async () => ({
        id: '3f4c0a1e-7b62-4d95-9a08-0e1c2d3f4a5b',
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'NGN',
      })),
    };
    service = new CurrencyPairService(repository, {} as any);
  });

  it('normalizes codes on create', async () => {
    await service.create({
      fromCurrencyCode: 'xlm',
      toCurrencyCode: 'usdc',
      spreadPercent: 0.5,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'USDC',
      }),
    );
  });

  it('normalizes codes and rejects read-only fields on update', async () => {
    await service.update('id', {
      fromCurrencyCode: 'usdc',
      toCurrencyCode: 'ngn',
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fromCurrencyCode: 'USDC',
        toCurrencyCode: 'NGN',
      }),
    );

    await expect(
      service.update('id', { createdAt: new Date() } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects out-of-range spreads and inverted limits', async () => {
    await expect(
      service.create({
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'NGN',
        spreadPercent: 101,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create({
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'NGN',
        minAmountUsd: 100,
        maxAmountUsd: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suspends with a validated reason and duration', async () => {
    await service.suspend('id', { reason: 'Maintenance', duration: 'PT1H' });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        suspensionReason: 'Maintenance',
      }),
    );
  });
});
