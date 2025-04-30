export interface TransactionCurrencyStats {
    currency: string;
    count: number;
    totalVolume: number;
    avgValue: number;
  }
  
  export class TransactionsStatsDto {
    totalTransactions: number;
    currencyStats: TransactionCurrencyStats[];
    mostUsedCurrencies: string[];
  }