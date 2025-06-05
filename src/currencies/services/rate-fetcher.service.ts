import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class RateFetcherService {
  private readonly logger = new Logger(RateFetcherService.name);
  private readonly fiatApiUrl = 'https://openexchangerates.org/api/latest.json';
  private readonly cryptoApiUrl = 'https://api.coingecko.com/api/v3/simple/price';
  private readonly supportedCurrencies = ['NGN', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT'];

  // This method should be called periodically (e.g., every 5 minutes)
  async fetchRates(): Promise<any> {
    try {
      // Fetch fiat rates
      const fiatRates = await this.fetchFiatRates();
      // Fetch crypto rates
      const cryptoRates = await this.fetchCryptoRates();
      // Combine and return
      return { ...fiatRates, ...cryptoRates };
    } catch (error) {
      this.logger.error('Failed to fetch rates', error);
      throw error;
    }
  }

  private async fetchFiatRates(): Promise<any> {
    // TODO: Use your OpenExchangeRates APP_ID from env
    const appId = process.env.OPENEXCHANGERATES_APP_ID;
    if (!appId) throw new Error('Missing OpenExchangeRates APP_ID');
    const response = await axios.get(this.fiatApiUrl, {
      params: {
        app_id: appId,
        symbols: this.supportedCurrencies.filter(c => ['NGN', 'USD', 'EUR', 'GBP'].includes(c)).join(',')
      }
    });
    const data = response.data as { rates: Record<string, number> };
    return data.rates;
  }

  private async fetchCryptoRates(): Promise<any> {
    const ids = ['bitcoin', 'ethereum', 'tether'];
    const vsCurrencies = ['usd', 'ngn', 'eur', 'gbp'];
    const response = await axios.get(this.cryptoApiUrl, {
      params: {
        ids: ids.join(','),
        vs_currencies: vsCurrencies.join(',')
      }
    });
    const data = response.data as { bitcoin: any; ethereum: any; tether: any };
    return {
      BTC: data.bitcoin,
      ETH: data.ethereum,
      USDT: data.tether
    };
  }
}
