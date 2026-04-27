import { DataSource } from 'typeorm';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';

export async function seedExchangeRates(dataSource: DataSource) {
    const exchangeRateRepository = dataSource.getRepository(ExchangeRate);
    const rates = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        fromCurrency: 'USD',
        toCurrency: 'NGN',
        rate: 1000 + i * 10,
        timestamp: new Date(Date.now() - i * 3600 * 1000),
    }));
    await exchangeRateRepository.upsert(rates, ['id']);
}
