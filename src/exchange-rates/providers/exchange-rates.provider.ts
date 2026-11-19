import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export class ExchangeRatesProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExchangeRatesProviderError';
  }
}

@Injectable()
export class ExchangeRatesProviderClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService.get<string>('EXCHANGE_RATES_PROVIDER_BASE_URL') ||
      'https://api.coingecko.com/api/v3';
    this.timeoutMs = this.getTimeoutMs();
  }

  async fetchRate(
    from: string,
    to: string,
  ): Promise<{
    rate: number;
    fetchedAt: string;
    source: string;
  }> {
    const fromUpper = from.toUpperCase().trim();
    const toUpper = to.toUpperCase().trim();

    if (fromUpper === toUpper) {
      return {
        rate: 1,
        fetchedAt: new Date().toISOString(),
        source: 'identity',
      };
    }

    const cryptoIds: Record<string, string> = {
      XLM: 'stellar',
      USDC: 'usd-coin',
      USDT: 'tether',
      BTC: 'bitcoin',
      ETH: 'ethereum',
      XRP: 'ripple',
    };

    try {
      // Scenario 1: Base currency is a supported cryptocurrency
      if (cryptoIds[fromUpper]) {
        const coinId = cryptoIds[fromUpper];
        const vsCurrency = toUpper.toLowerCase();
        const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`;
        const response = await firstValueFrom(
          this.httpService.get(url, {
            timeout: this.timeoutMs,
            headers: this.getApiHeaders(),
          }),
        );
        const data = response.data;
        if (
          data &&
          data[coinId] &&
          this.isPositiveFiniteRate(data[coinId][vsCurrency])
        ) {
          return {
            rate: data[coinId][vsCurrency],
            fetchedAt: new Date().toISOString(),
            source: 'coingecko',
          };
        }
      }

      // Scenario 2: Target currency is a supported cryptocurrency (inverse query)
      if (cryptoIds[toUpper]) {
        const coinId = cryptoIds[toUpper];
        const vsCurrency = fromUpper.toLowerCase();
        const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`;
        const response = await firstValueFrom(
          this.httpService.get(url, {
            timeout: this.timeoutMs,
            headers: this.getApiHeaders(),
          }),
        );
        const data = response.data;
        if (
          data &&
          data[coinId] &&
          this.isPositiveFiniteRate(data[coinId][vsCurrency])
        ) {
          const inverseRate = data[coinId][vsCurrency];
          const rate = 1 / inverseRate;
          if (!Number.isFinite(rate) || rate <= 0) {
            throw new ExchangeRatesProviderError(
              `Invalid exchange rate for ${fromUpper}->${toUpper}`,
            );
          }
          return {
            rate,
            fetchedAt: new Date().toISOString(),
            source: 'coingecko-inverse',
          };
        }
      }

      // Scenario 3: Both are fiat currencies (e.g. USD to NGN) using XLM (stellar) as a bridge
      const url = `${this.baseUrl}/simple/price?ids=stellar&vs_currencies=${fromUpper.toLowerCase()},${toUpper.toLowerCase()}`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: this.timeoutMs,
          headers: this.getApiHeaders(),
        }),
      );
      const data = response.data;
      if (data && data.stellar) {
        const fromVal = data.stellar[fromUpper.toLowerCase()];
        const toVal = data.stellar[toUpper.toLowerCase()];
        if (
          this.isPositiveFiniteRate(fromVal) &&
          this.isPositiveFiniteRate(toVal)
        ) {
          const rate = toVal / fromVal;
          if (!Number.isFinite(rate) || rate <= 0) {
            throw new ExchangeRatesProviderError(
              `Invalid exchange rate for ${fromUpper}->${toUpper}`,
            );
          }
          return {
            rate,
            fetchedAt: new Date().toISOString(),
            source: 'coingecko-bridge',
          };
        }
      }

      throw new ExchangeRatesProviderError(
        `Unsupported or unmappable currency pair: ${fromUpper}->${toUpper}`,
      );
    } catch (error: any) {
      if (error instanceof ExchangeRatesProviderError) {
        throw error;
      }
      throw new ExchangeRatesProviderError(
        error.message ||
          `Failed to fetch rate for ${fromUpper}->${toUpper} from CoinGecko`,
      );
    }
  }

  private getTimeoutMs(): number {
    const raw = this.configService.get<string>(
      'EXCHANGE_RATES_PROVIDER_TIMEOUT_MS',
    );
    const parsed = raw ? Number(raw) : 5000;
    if (!Number.isFinite(parsed) || parsed <= 0) return 5000;
    return Math.floor(parsed);
  }

  private getApiHeaders(): Record<string, string> {
    const apiKey = this.configService.get<string>(
      'EXCHANGE_RATES_PROVIDER_API_KEY',
    );
    return apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
  }

  private isPositiveFiniteRate(value: unknown): value is number {
    if (typeof value !== 'number') {
      return false;
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new ExchangeRatesProviderError(
        'CoinGecko returned a non-positive or non-finite exchange rate',
      );
    }
    return true;
  }
}
