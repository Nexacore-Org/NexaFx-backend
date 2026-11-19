import { DataSource } from 'typeorm';
import { Currency } from '../../currencies/currency.entity';
import { seedCurrencies } from './currency.seeder';

describe('seedCurrencies', () => {
  it('upserts codes that fit the currency column and marks only NGN as base', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ upsert }),
    } as unknown as DataSource;

    await seedCurrencies(dataSource);

    expect(dataSource.getRepository).toHaveBeenCalledWith(Currency);
    expect(upsert).toHaveBeenCalledTimes(1);

    const [currencies, conflictPaths] = upsert.mock.calls[0];
    expect(conflictPaths).toEqual(['code']);
    expect(currencies.map((currency: { code: string }) => currency.code)).toEqual(
      expect.arrayContaining(['XLM', 'NGN', 'USDC', 'USDT']),
    );

    for (const currency of currencies as Array<{
      code: string;
      isBase: boolean;
    }>) {
      expect(currency.code).toMatch(/^[A-Z0-9]{2,10}$/);
      expect(currency.code.length).toBeLessThanOrEqual(10);
    }

    expect(
      (currencies as Array<{ code: string; isBase: boolean }>)
        .filter((currency) => currency.isBase)
        .map((currency) => currency.code),
    ).toEqual(['NGN']);
  });
});
