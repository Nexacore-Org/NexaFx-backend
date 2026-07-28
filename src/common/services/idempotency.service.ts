import { Injectable, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export interface IdempotencyCacheEntry {
  endpoint: string;
  statusCode: number;
  body: any;
  expiresAt: number;
}

@Injectable()
export class IdempotencyRedisCache {
  private store = new Map<string, IdempotencyCacheEntry>();

  constructor(
    @Optional() @Inject('REDIS_CLIENT') private readonly redisClient: any,
    private readonly configService: ConfigService,
  ) {}

  private getKey(userId: string, idempotencyKey: string): string {
    return `nexafx:idempotency:${userId}:${idempotencyKey}`;
  }

  private getTtlSeconds(): number {
    return 24 * 60 * 60;
  }

  async get(
    userId: string,
    idempotencyKey: string,
  ): Promise<IdempotencyCacheEntry | null> {
    const key = this.getKey(userId, idempotencyKey);

    if (this.redisClient) {
      const cached = await this.redisClient.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as IdempotencyCacheEntry;
    }

    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async set(
    userId: string,
    idempotencyKey: string,
    entry: Omit<IdempotencyCacheEntry, 'expiresAt'>,
  ): Promise<void> {
    const key = this.getKey(userId, idempotencyKey);
    const value: IdempotencyCacheEntry = {
      ...entry,
      expiresAt: Date.now() + this.getTtlSeconds() * 1000,
    };

    if (this.redisClient) {
      await this.redisClient.set(
        key,
        JSON.stringify(value),
        'EX',
        this.getTtlSeconds(),
      );
      return;
    }

    this.store.set(key, value);
  }
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly cache: IdempotencyRedisCache) {}

  generateRequestHash(body: any): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(body));
    return hash.digest('hex');
  }

  validateIdempotencyKey(key: string): { valid: boolean; error?: string } {
    if (!key) {
      return { valid: false, error: 'Idempotency-Key header is required' };
    }
    if (key.length > 128) {
      return {
        valid: false,
        error: 'Idempotency-Key must be at most 128 characters',
      };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return {
        valid: false,
        error:
          'Idempotency-Key must contain only alphanumeric characters, hyphens, and underscores',
      };
    }
    return { valid: true };
  }

  async checkEndpointMatch(
    userId: string,
    idempotencyKey: string,
    endpoint: string,
  ): Promise<{ match: boolean; cached?: IdempotencyCacheEntry }> {
    const normalizedUserId = userId || 'anonymous';
    const cached = await this.cache.get(normalizedUserId, idempotencyKey);
    if (!cached) {
      return { match: true };
    }
    if (cached.endpoint === endpoint) {
      return { match: true, cached };
    }
    return { match: false, cached };
  }

  async checkIdempotency(
    key: string,
    userId: string,
    requestBody: any,
    endpoint: string,
  ): Promise<{ statusCode: number; body: any; replayed: boolean } | null> {
    const { match, cached } = await this.checkEndpointMatch(
      userId,
      key,
      endpoint,
    );

    if (!match) {
      const error: any = new Error(
        'Idempotency key already used for a different endpoint',
      );
      error.code = 'IDEMPOTENCY_KEY_CONFLICT';
      throw error;
    }

    if (cached) {
      return {
        statusCode: cached.statusCode,
        body: cached.body,
        replayed: true,
      };
    }

    return null;
  }

  async storeIdempotency(
    key: string,
    userId: string,
    endpoint: string,
    responseStatus: number,
    responseBody: any,
  ): Promise<void> {
    await this.cache.set(userId, key, {
      endpoint,
      statusCode: responseStatus,
      body: responseBody,
    });
  }
}
