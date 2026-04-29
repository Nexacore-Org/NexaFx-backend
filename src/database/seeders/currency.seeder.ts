import { DataSource } from 'typeorm';
import { Currency } from '../../currencies/currency.entity';

export async function seedCurrencies(dataSource: DataSource) {
    const currencyRepository = dataSource.getRepository(Currency);
    const currencies = [
        { code: 'XLM', name: 'Stellar Lumens', decimals: 7, isBase: true, isActive: true },
        { code: 'USDC', name: 'USD Coin', decimals: 6, isBase: false, isActive: true },
        { code: 'USD', name: 'US Dollar', decimals: 2, isBase: false, isActive: true },
        { code: 'EUR', name: 'Euro', decimals: 2, isBase: false, isActive: true },
        { code: 'NGN', name: 'Nigerian Naira', decimals: 2, isBase: false, isActive: true },
        { code: 'GBP', name: 'British Pound', decimals: 2, isBase: false, isActive: true },
        { code: 'BTC', name: 'Bitcoin', decimals: 8, isBase: false, isActive: true },
        { code: 'ETH', name: 'Ethereum', decimals: 8, isBase: false, isActive: true },
        { code: 'USDT', name: 'Tether', decimals: 6, isBase: false, isActive: true },
        { code: 'XRP', name: 'Ripple', decimals: 6, isBase: false, isActive: true },
    ];
    await currencyRepository.upsert(currencies, ['code']);
}
