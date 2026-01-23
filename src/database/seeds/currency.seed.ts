import { DataSource } from 'typeorm';
import { Currency } from '../../currencies/currency.entity';

export async function seedCurrencies(dataSource: DataSource): Promise<void> {
  const currencyRepository = dataSource.getRepository(Currency);

  const currencies = [
    {
      code: 'NGN',
      name: 'Nigerian Naira',
      decimals: 2,
      isBase: true,
      isActive: true,
    },
    {
      code: 'USD',
      name: 'United States Dollar',
      decimals: 2,
      isBase: false,
      isActive: true,
    },
    {
      code: 'EUR',
      name: 'Euro',
      decimals: 2,
      isBase: false,
      isActive: true,
    },
    {
      code: 'GBP',
      name: 'British Pound Sterling',
      decimals: 2,
      isBase: false,
      isActive: true,
    },
    {
      code: 'JPY',
      name: 'Japanese Yen',
      decimals: 0,
      isBase: false,
      isActive: true,
    },
    {
      code: 'CAD',
      name: 'Canadian Dollar',
      decimals: 2,
      isBase: false,
      isActive: true,
    },
    {
      code: 'AUD',
      name: 'Australian Dollar',
      decimals: 2,
      isBase: false,
      isActive: true,
    },
  ];

  for (const currencyData of currencies) {
    const existing = await currencyRepository.findOne({
      where: { code: currencyData.code },
    });

    if (!existing) {
      const currency = currencyRepository.create(currencyData);
      await currencyRepository.save(currency);
      console.log(`Seeded currency: ${currencyData.code} - ${currencyData.name}`);
    }
  }

  console.log('Currency seeding completed!');
}
