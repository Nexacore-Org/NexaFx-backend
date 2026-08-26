import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../modules/redis/redis.service';

export interface ExchangeRateCacheEntry {
  rate: number;
  fetchedAt: string;
  expiresAt: string;
}

interface InternalCacheEntry extends ExchangeRateCacheEntry {
  expiresAtMs: number;
}

@Injectable()
export class ExchangeRatesCache {
  private readonly logger = new Logger(ExchangeRatesCache.name);
  private readonly store = new Map<string, InternalCacheEntry>();
  private readonly ttlMs: number;
  private readonly ttlSeconds: number;
  private readonly maxSize: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.ttlMs = this.getCacheTtlMs();
    this.ttlSeconds = Math.ceil(this.ttlMs / 1000);
    this.maxSize = this.getCacheMaxSize();
  }

  async get(key: string): Promise<ExchangeRateCacheEntry | null> {
    const redisKey = this.redisService.key('exchange-rates', key);
    const redisEntry =
      await this.redisService.getJson<ExchangeRateCacheEntry>(redisKey);
    if (redisEntry) {
      this.logger.log(`Exchange rate cache hit from Redis: ${redisKey}`);
      return redisEntry;
    }

    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAtMs) {
      this.store.delete(key);
      return null;
    }

    return {
      rate: entry.rate,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    };
  }

  async set(
    key: string,
    entry: { rate: number; fetchedAt: string },
  ): Promise<ExchangeRateCacheEntry> {
    const fetchedAtMs = Date.parse(entry.fetchedAt);
    const baseTime = Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now();
    const expiresAtMs = baseTime + this.ttlMs;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const stored: InternalCacheEntry = {
      rate: entry.rate,
      fetchedAt: entry.fetchedAt,
      expiresAt,
      expiresAtMs,
    };

    this.store.set(key, stored);
    this.sweepExpired();
    this.enforceMaxSize();

    const cacheEntry = {
      rate: stored.rate,
      fetchedAt: stored.fetchedAt,
      expiresAt: stored.expiresAt,
    };

    await this.redisService.setJson(
      this.redisService.key('exchange-rates', key),
      cacheEntry,
      this.ttlSeconds,
    );

    return cacheEntry;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAtMs) {
        this.store.delete(key);
      }
    }
  }

  private enforceMaxSize(): void {
    if (this.store.size <= this.maxSize) return;
    const overflow = this.store.size - this.maxSize;
    let removed = 0;

    for (const key of this.store.keys()) {
      this.store.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  private getCacheTtlMs(): number {
    const raw = this.configService.get<string>(
      'EXCHANGE_RATES_CACHE_TTL_SECONDS',
    );
    const parsed = raw ? Number(raw) : 60;
    if (!Number.isFinite(parsed) || parsed <= 0) return 60 * 1000;
    return parsed * 1000;
  }

  private getCacheMaxSize(): number {
    const raw = this.configService.get<string>('EXCHANGE_RATES_CACHE_MAX_SIZE');
    const parsed = raw ? Number(raw) : 1000;
    if (!Number.isFinite(parsed) || parsed <= 0) return 1000;
    return Math.floor(parsed);
  }
}
