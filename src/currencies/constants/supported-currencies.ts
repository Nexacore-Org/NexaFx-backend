import { CurrencyType } from '../enum/currencyType.enum';

export const SUPPORTED_CURRENCIES = ['NGN', 'USD'] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const CURRENCY_CONFIG = {
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    decimalPlaces: 2,
    type: CurrencyType.FIAT,
    isActive: true,
    isFeatured: true,
    logoUrl: 'https://flagcdn.com/24x18/ng.png',
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimalPlaces: 2,
    type: CurrencyType.FIAT,
    isActive: true,
    isFeatured: true,
    logoUrl: 'https://flagcdn.com/24x18/us.png',
  },
} as const;

export const EXCHANGE_RATES = {
  NGN: {
    USD: 0.00062, // 1 NGN = 0.00062 USD
  },
  USD: {
    NGN: 1610, // 1 USD = 1610 NGN
  },
} as const;

export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
}

export function getCurrencyConfig(currency: SupportedCurrency) {
  return CURRENCY_CONFIG[currency];
}

export function getExchangeRate(from: SupportedCurrency, to: SupportedCurrency): number {
  if (from === to) return 1;
  return EXCHANGE_RATES[from][to];
}
