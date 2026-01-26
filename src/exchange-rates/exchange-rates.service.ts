import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CurrenciesService } from '../currencies/currencies.service';
import {
  ExchangeRatesProviderClient,
  ExchangeRatesProviderError,
} from './providers/exchange-rates.provider';
import {
  ExchangeRatesCache,
  ExchangeRateCacheEntry,
} from './cache/exchange-rates.cache';

export interface ExchangeRateResult {
  from: string;
  to: string;
  rate: number;
  fetchedAt?: string;
  expiresAt?: string;
}

export interface ExchangeRateConversionResult {
  rate: number;
  convertedAmount: number;
  fetchedAt?: string;
  expiresAt?: string;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly currenciesService: CurrenciesService,
    private readonly providerClient: ExchangeRatesProviderClient,
    private readonly cache: ExchangeRatesCache,
  ) {}

  async getRate(from: string, to: string): Promise<ExchangeRateResult> {
    const fromCode = this.normalizeCurrencyCode(from, 'from');
    const toCode = this.normalizeCurrencyCode(to, 'to');

    await this.validateCurrencyPair(fromCode, toCode);

    const cacheKey = this.getCacheKey(fromCode, toCode);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return this.toRateResult(fromCode, toCode, cached);
    }

    if (fromCode === toCode) {
      const entry = this.cache.set(cacheKey, {
        rate: 1,
        fetchedAt: new Date().toISOString(),
      });
      return this.toRateResult(fromCode, toCode, entry);
    }

    try {
      const providerRate = await this.providerClient.fetchRate(fromCode, toCode);
      const entry = this.cache.set(cacheKey, {
        rate: providerRate.rate,
        fetchedAt: providerRate.fetchedAt,
      });
      return this.toRateResult(fromCode, toCode, entry);
    } catch (error) {
      this.logger.error(
        `Failed to fetch rate ${fromCode}->${toCode}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof ExchangeRatesProviderError) {
        throw new BadGatewayException(error.message);
      }

      throw new BadGatewayException('Failed to fetch exchange rate');
    }
  }

  async convert(
    from: string,
    to: string,
    amount: number,
  ): Promise<ExchangeRateConversionResult> {
    const fromCode = this.normalizeCurrencyCode(from, 'from');
    const toCode = this.normalizeCurrencyCode(to, 'to');
    this.validateAmount(amount);

    const rateResult = await this.getRate(fromCode, toCode);
    const convertedAmount = this.multiplyAmount(amount, rateResult.rate);

    return {
      rate: rateResult.rate,
      convertedAmount,
      fetchedAt: rateResult.fetchedAt,
      expiresAt: rateResult.expiresAt,
    };
  }

  private async validateCurrencyPair(
    from: string,
    to: string,
  ): Promise<void> {
    try {
      await Promise.all([
        this.currenciesService.validateCurrency(from),
        this.currenciesService.validateCurrency(to),
      ]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private validateAmount(amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('Amount must be a finite number');
    }
    if (amount < 0) {
      throw new BadRequestException(
        'Amount must be greater than or equal to 0',
      );
    }
  }

  private normalizeCurrencyCode(code: string, field: string): string {
    if (typeof code !== 'string' || !code.trim()) {
      throw new BadRequestException(`Currency '${field}' is required`);
    }
    return code.trim().toUpperCase();
  }

  private getCacheKey(from: string, to: string): string {
    return `${from}_${to}`;
  }

  private toRateResult(
    from: string,
    to: string,
    entry: ExchangeRateCacheEntry,
  ): ExchangeRateResult {
    return {
      from,
      to,
      rate: entry.rate,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    };
  }

  private multiplyAmount(amount: number, rate: number): number {
    const result = this.multiplyDecimal(amount, rate);
    if (!Number.isFinite(result)) {
      return amount * rate;
    }
    return result;
  }

  private multiplyDecimal(a: number, b: number): number {
    const aStr = a.toString();
    const bStr = b.toString();

    if (aStr.includes('e') || aStr.includes('E')) {
      return a * b;
    }
    if (bStr.includes('e') || bStr.includes('E')) {
      return a * b;
    }

    const aParts = aStr.split('.');
    const bParts = bStr.split('.');
    const aDecimals = aParts[1]?.length ?? 0;
    const bDecimals = bParts[1]?.length ?? 0;
    const scale = aDecimals + bDecimals;

    const aDigits = aParts.join('');
    const bDigits = bParts.join('');

    if (!/^[0-9]+$/.test(aDigits) || !/^[0-9]+$/.test(bDigits)) {
      return a * b;
    }

    const product = BigInt(aDigits) * BigInt(bDigits);
    const productStr = product.toString();

    if (scale === 0) {
      return Number(productStr);
    }

    const padded = productStr.padStart(scale + 1, '0');
    const decimalIndex = padded.length - scale;
    const resultStr = `${padded.slice(0, decimalIndex)}.${padded.slice(
      decimalIndex,
    )}`;

    return Number(resultStr);
  }
}
