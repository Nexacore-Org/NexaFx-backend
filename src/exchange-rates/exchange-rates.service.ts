import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CurrenciesService } from '../currencies/currencies.service';
import { ExchangeRatesProviderClient } from './providers/exchange-rates.provider';
import { ExchangeRateSnapshot } from './entities/exchange-rate-snapshot.entity';
import Decimal from 'decimal.js';
import { Subject, Observable } from 'rxjs';

export interface ExchangeRateResponseDto {
  from: string;
  to: string;
  rate: number;
  inverseRate: number;
  provider: string;
  cachedAt: string;
  expiresAt: string;
  stale?: boolean;
}

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  private readonly rateUpdatesSubject = new Subject<{
    from: string;
    to: string;
    rate: number;
    fetchedAt: string;
  }>();

  public readonly rateUpdates$: Observable<{
    from: string;
    to: string;
    rate: number;
    fetchedAt: string;
  }> = this.rateUpdatesSubject.asObservable();

  constructor(
    private readonly currenciesService: CurrenciesService,
    private readonly providerClient: ExchangeRatesProviderClient,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectRepository(ExchangeRateSnapshot)
    private readonly snapshotRepository: Repository<ExchangeRateSnapshot>,
  ) {}

  async getRate(from: string, to: string): Promise<ExchangeRateResult> {
    const fromCode = this.normalizeCurrencyCode(from, 'from');
    const toCode = this.normalizeCurrencyCode(to, 'to');

    await this.validateCurrencyPair(fromCode, toCode);

    const cacheKey = this.getCacheKey(fromCode, toCode);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return this.toRateResult(fromCode, toCode, cached);
    }

    if (fromCode === toCode) {
      const entry = await this.cache.set(cacheKey, {
        rate: 1,
        fetchedAt: new Date().toISOString(),
      });
      this.notifyRateUpdate(fromCode, toCode, entry);
      return this.toRateResult(fromCode, toCode, entry);
  /**
   * Validate a currency pair (both currencies must be valid)
   */
  async validateCurrencyPair(from: string, to: string): Promise<void> {
    const fromCode = from.trim().toUpperCase();
    const toCode = to.trim().toUpperCase();
    await this.validateCurrency(fromCode);
    await this.validateCurrency(toCode);
  }

  /**
   * Fetch exchange rate for a currency pair with caching and failure handling
   */
  async getRate(from: string, to: string): Promise<ExchangeRateResponseDto> {
    const fromCode = from.trim().toUpperCase();
    const toCode = to.trim().toUpperCase();

    // Validate currencies
    await this.validateCurrency(fromCode);
    await this.validateCurrency(toCode);

    const cacheKey = `rate:${fromCode}:${toCode}`;

    // Look up cached rate
    const cachedEntry = await this.cacheManager.get<any>(cacheKey);

    if (cachedEntry) {
      const now = Date.now();
      const expiresAtMs = new Date(cachedEntry.expiresAt).getTime();

      // Check if cache is still valid (60 seconds)
      if (now < expiresAtMs) {
        return {
          from: cachedEntry.from,
          to: cachedEntry.to,
          rate: cachedEntry.rate,
          inverseRate: cachedEntry.inverseRate,
          provider: cachedEntry.provider,
          cachedAt: cachedEntry.cachedAt,
          expiresAt: cachedEntry.expiresAt,
        };
      }
    }

    // Cache expired or not found - attempt external provider fetch
    try {
      const providerRate = await this.providerClient.fetchRate(
        fromCode,
        toCode,
      );
      const entry = await this.cache.set(cacheKey, {
        rate: providerRate.rate,
        fetchedAt: providerRate.fetchedAt,
      });
      this.notifyRateUpdate(fromCode, toCode, entry);
      return this.toRateResult(fromCode, toCode, entry);
    } catch (error) {
      this.logger.error(
        `Failed to fetch rate ${fromCode}->${toCode}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof ExchangeRatesProviderError) {
        throw new ServiceUnavailableException(error.message);
      const fetched = await this.providerClient.fetchRate(fromCode, toCode);

      const cachedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60000).toISOString(); // 60 seconds TTL

      const rateDecimal = new Decimal(fetched.rate);
      const inverseRateDecimal = rateDecimal.isZero() ? new Decimal(0) : new Decimal(1).div(rateDecimal);

      const response: ExchangeRateResponseDto = {
        from: fromCode,
        to: toCode,
        rate: rateDecimal.toNumber(),
        inverseRate: inverseRateDecimal.toNumber(),
        provider: 'coingecko',
        cachedAt,
        expiresAt,
      };

      // Cache the rate (use long cache-manager TTL since we handle expiration manually)
      await this.cacheManager.set(cacheKey, response, 86400 * 1000); // 24 hours

      // Emit the rate update
      try {
        this.rateUpdatesSubject.next({
          from: fromCode,
          to: toCode,
          rate: response.rate,
          fetchedAt: cachedAt,
        });
      } catch (emitErr) {
        this.logger.warn(`Failed to emit rate update event: ${emitErr}`);
      }

      // Save database snapshot for history bonus
      try {
        const snapshot = this.snapshotRepository.create({
          from: fromCode,
          to: toCode,
          rate: rateDecimal.toFixed(8),
        });
        await this.snapshotRepository.save(snapshot);
      } catch (dbErr) {
        this.logger.warn(`Failed to persist exchange rate snapshot: ${dbErr}`);
      }

      return response;
    } catch (providerErr) {
      this.logger.warn(
        `Provider fetch failed for ${fromCode}->${toCode}: ${providerErr}. Checking stale cache...`,
      );

      // Attempt cached lookup for stale fallback
      if (cachedEntry) {
        return {
          from: cachedEntry.from,
          to: cachedEntry.to,
          rate: cachedEntry.rate,
          inverseRate: cachedEntry.inverseRate,
          provider: cachedEntry.provider,
          cachedAt: cachedEntry.cachedAt,
          expiresAt: cachedEntry.expiresAt,
          stale: true,
        };
      }

      // If no cache exists, raise Service Unavailable (never 500)
      throw new ServiceUnavailableException(
        `Exchange rate provider is currently unavailable for pair ${fromCode}->${toCode}`,
      );
    }
  }

  /**
   * Return supported currency pairs
   */
  async getSupportedPairs(): Promise<string[]> {
    return [
      'XLM-NGN',
      'NGN-XLM',
      'XLM-USD',
      'USD-XLM',
      'XLM-EUR',
      'EUR-XLM',
      'XLM-GBP',
      'GBP-XLM',
      'USDC-NGN',
      'NGN-USDC',
      'USDT-NGN',
      'NGN-USDT',
    ];
  }

  /**
   * Return daily OHLC data for historical exchange rates
   */
  async getDailyOHLCHistory(
    from: string,
    to: string,
    days: number,
  ): Promise<any[]> {
    const fromCode = from.trim().toUpperCase();
    const toCode = to.trim().toUpperCase();
    const numDays = Math.max(1, Math.min(30, days || 7));

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);

    const snapshots = await this.snapshotRepository.find({
      where: {
        from: fromCode,
        to: toCode,
        timestamp: MoreThan(startDate),
      },
      order: { timestamp: 'ASC' },
    });

    const grouped: Record<string, ExchangeRateSnapshot[]> = {};
    for (const snap of snapshots) {
      const dateStr = new Date(snap.timestamp).toISOString().split('T')[0];
      grouped[dateStr] ??= [];
      grouped[dateStr].push(snap);
    }

    return Object.keys(grouped).map((date) => {
      const snaps = grouped[date];
      const rates = snaps.map((s) => parseFloat(s.rate));
      return {
        date,
        open: rates[0],
        high: Math.max(...rates),
        low: Math.min(...rates),
        close: rates[rates.length - 1],
      };
    });
  }

  private async validateCurrency(code: string): Promise<void> {
    try {
      await this.currenciesService.validateCurrency(code);
    } catch (err: any) {
      throw new BadRequestException(err.message || `Currency '${code}' is invalid`);
    }
  }
}
