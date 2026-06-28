import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const DEFAULT_PROVIDER_URL = 'https://api.exchangerate.host';
const DEFAULT_TIMEOUT_MS = 5000;
const CURRENCY_REGEX = /^[A-Z]{3}$/;

interface ExchangeRateResponse {
  success?: boolean;
  result?: number;
  rates?: Record<string, number>;
  info?: {
    rate?: number;
  };
  error?: {
    info?: string;
  };
}

export interface ExchangeRateResult {
  rate: number;
  fetchedAt: string;
  source: string;
}

export class ExchangeRatesProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ExchangeRatesProviderError.name;
  }
}

@Injectable()
export class ExchangeRatesProviderClient {
  private readonly logger = new Logger(
    ExchangeRatesProviderClient.name,
  );

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('EXCHANGE_RATES_PROVIDER_BASE_URL') || 'https://api.coingecko.com/v3';
    this.timeoutMs = this.getTimeoutMs();
  }

  async fetchRate(
    from: string,
    to: string,
  ): Promise<ExchangeRateResult> {
    const base = this.normalizeCurrency(from);
    const target = this.normalizeCurrency(to);

    const url = this.buildLatestUrl(base, target);

    this.logger.debug(`Fetching exchange rate ${base} -> ${target}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<ExchangeRateResponse>(url, {
          timeout: this.timeoutMs,
        }),
      );

      const data = response.data;

      if (!data || data.success === false) {
        throw new ExchangeRatesProviderError(
          data?.error?.info ?? 'Exchange rate provider returned an error.',
        );
      }

      const rate = this.extractRate(data, target);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new ExchangeRatesProviderError(
          'Provider returned an invalid exchange rate.',
        );
      }

    if (fromUpper === toUpper) {
      return {
        rate: 1,
        fetchedAt: new Date().toISOString(),
        source: 'identity',
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private extractRate(
    data: ExchangeRateResponse,
    currency: string,
  ): number {
    if (data.rates?.[currency] !== undefined) {
      return Number(data.rates[currency]);
    }

    if (data.result !== undefined) {
      return Number(data.result);
    }

    if (data.info?.rate !== undefined) {
      return Number(data.info.rate);
    }
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
          this.httpService.get(url, { timeout: this.timeoutMs }),
        );
        const data = response.data;
        if (data && data[coinId] && typeof data[coinId][vsCurrency] === 'number') {
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
          this.httpService.get(url, { timeout: this.timeoutMs }),
        );
        const data = response.data;
        if (data && data[coinId] && typeof data[coinId][vsCurrency] === 'number') {
          const inverseRate = data[coinId][vsCurrency];
          if (inverseRate > 0) {
            return {
              rate: 1 / inverseRate,
              fetchedAt: new Date().toISOString(),
              source: 'coingecko-inverse',
            };
          }
        }
      }

  private buildLatestUrl(from: string, to: string): string {
    const url = new URL(this.baseUrl);

    url.pathname = `${url.pathname.replace(/\/$/, '')}/latest`;

    url.searchParams.set('base', from);
    url.searchParams.set('symbols', to);
      // Scenario 3: Both are fiat currencies (e.g. USD to NGN) using XLM (stellar) as a bridge
      const url = `${this.baseUrl}/simple/price?ids=stellar&vs_currencies=${fromUpper.toLowerCase()},${toUpper.toLowerCase()}`;
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: this.timeoutMs }),
      );
      const data = response.data;
      if (data && data.stellar) {
        const fromVal = data.stellar[fromUpper.toLowerCase()];
        const toVal = data.stellar[toUpper.toLowerCase()];
        if (typeof fromVal === 'number' && typeof toVal === 'number' && fromVal > 0) {
          return {
            rate: toVal / fromVal,
            fetchedAt: new Date().toISOString(),
            source: 'coingecko-bridge',
          };
        }
      }

      throw new ExchangeRatesProviderError(`Unsupported or unmappable currency pair: ${fromUpper}->${toUpper}`);
    } catch (error: any) {
      if (error instanceof ExchangeRatesProviderError) {
        throw error;
      }
      throw new ExchangeRatesProviderError(
        error.message || `Failed to fetch rate for ${fromUpper}->${toUpper} from CoinGecko`,
      );
    }

    return url.toString();
  }

  private normalizeCurrency(currency: string): string {
    const value = currency.trim().toUpperCase();

    if (!CURRENCY_REGEX.test(value)) {
      throw new ExchangeRatesProviderError(
        `Invalid currency code: ${currency}`,
      );
    }

    return value;
  }

  private handleError(error: unknown): ExchangeRatesProviderError {
    if (error instanceof ExchangeRatesProviderError) {
      return error;
    }

    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        return new ExchangeRatesProviderError(
          'Exchange rate provider request timed out.',
        );
      }

      if (error.response) {
        return new ExchangeRatesProviderError(
          `Exchange rate provider responded with status ${error.response.status}.`,
        );
      }

      if (error.request) {
        return new ExchangeRatesProviderError(
          'Exchange rate provider is unreachable.',
        );
      }
    }

    this.logger.error('Unexpected provider error', error);

    return new ExchangeRatesProviderError(
      'Failed to fetch exchange rate.',
    );
  }

  private loadBaseUrl(): string {
    return (
      this.configService
        .get<string>('EXCHANGE_RATES_PROVIDER_BASE_URL')
        ?.trim() || DEFAULT_PROVIDER_URL
    );
  }

  private loadTimeout(): number {
    const timeout = Number(
      this.configService.get(
        'EXCHANGE_RATES_PROVIDER_TIMEOUT_MS',
        DEFAULT_TIMEOUT_MS,
      ),
    );

    return Number.isFinite(timeout) && timeout > 0
      ? Math.floor(timeout)
      : DEFAULT_TIMEOUT_MS;
  }
}