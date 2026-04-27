import { DataSource } from 'typeorm';
import { CurrencyPair } from '../../currencies/entities/currency-pair.entity';

export async function seedCurrencyPairs(dataSource: DataSource): Promise<void> {
  const currencyPairRepository = dataSource.getRepository(CurrencyPair);

  const pairs = [
    {
      fromCurrencyCode: 'XLM',
      toCurrencyCode: 'USDC',
      spreadPercent: 0.5,
      minAmountUsd: 1,
      maxAmountUsd: 10000,
    },
    {
      fromCurrencyCode: 'USDC',
      toCurrencyCode: 'XLM',
      spreadPercent: 0.5,
      minAmountUsd: 1,
      maxAmountUsd: 10000,
    },
    {
      fromCurrencyCode: 'XLM',
      toCurrencyCode: 'USD',
      spreadPercent: 0.5,
      minAmountUsd: 1,
      maxAmountUsd: 10000,
    },
    {
      fromCurrencyCode: 'BTC',
      toCurrencyCode: 'USD',
      spreadPercent: 0.8,
      minAmountUsd: 10,
      maxAmountUsd: 50000,
    },
    {
      fromCurrencyCode: 'NGN',
      toCurrencyCode: 'USD',
      spreadPercent: 1.5,
      minAmountUsd: 5,
      maxAmountUsd: 5000,
    },
    {
      fromCurrencyCode: 'GBP',
      toCurrencyCode: 'USD',
      spreadPercent: 0.7,
      minAmountUsd: 5,
      maxAmountUsd: 10000,
    },
    {
      fromCurrencyCode: 'EUR',
      toCurrencyCode: 'USD',
      spreadPercent: 0.7,
      minAmountUsd: 5,
      maxAmountUsd: 10000,
    },
  ];

  for (const pairData of pairs) {
    const existing = await currencyPairRepository.findOne({
      where: {
        fromCurrencyCode: pairData.fromCurrencyCode,
        toCurrencyCode: pairData.toCurrencyCode,
      },
    });

    if (!existing) {
      const pair = currencyPairRepository.create(pairData);
      await currencyPairRepository.save(pair);
      console.log(
        `Seeded currency pair: ${pairData.fromCurrencyCode}/${pairData.toCurrencyCode}`,
      );
    }
  }

  console.log('Currency pair seeding completed!');
}
