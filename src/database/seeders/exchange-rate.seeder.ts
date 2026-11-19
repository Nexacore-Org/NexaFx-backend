import { DataSource } from 'typeorm';
import { ExchangeRateSnapshot } from '../../exchange-rates/entities/exchange-rate-snapshot.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedExchangeRates(dataSource: DataSource) {
  const exchangeRateRepository = dataSource.getRepository(ExchangeRateSnapshot);
  const rates = Array.from({ length: 20 }, (_, i) => ({
    id: uuidv5(`rate${i}`, NAMESPACE),
    from: 'USD',
    to: 'NGN',
    rate: (1000 + i * 10).toFixed(8),
    timestamp: new Date(Date.now() - i * 3600 * 1000),
  }));
  await exchangeRateRepository.upsert(rates, ['id']);
}
