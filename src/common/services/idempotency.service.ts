import {
  Injectable,
  Inject,
  Optional,
  UnprocessableEntityException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { REDIS_CLIENT } from '../../modules/redis/redis.constants';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';

export interface IdempotencyCacheEntry {
  endpoint: string;
  statusCode: number;
  body: any;
  requestHash?: string;
  expiresAt: number;
  inProgress?: boolean;
}

@Injectable()
export class IdempotencyRedisCache {
  private readonly logger = new Logger(IdempotencyRedisCache.name);
  private store = new Map<string, IdempotencyCacheEntry>();

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient: any,
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
      try {
        const cached = await this.redisClient.get(key);
        if (!cached) return null;
        return JSON.parse(cached) as IdempotencyCacheEntry;
      } catch (error) {
        this.logger.warn(`Redis GET failed for idempotency key ${key}`);
        return null;
      }
    }

    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async reserve(
    userId: string,
    idempotencyKey: string,
    endpoint: string,
    requestHash: string,
  ): Promise<'reserved' | 'in_progress' | IdempotencyCacheEntry> {
    const key = this.getKey(userId, idempotencyKey);
    const ttl = this.getTtlSeconds();
    const inProgressEntry: IdempotencyCacheEntry = {
      endpoint,
      statusCode: 0,
      body: null,
      requestHash,
      expiresAt: Date.now() + ttl * 1000,
      inProgress: true,
    };

    if (this.redisClient) {
      try {
        const result = await this.redisClient.set(
          key,
          JSON.stringify(inProgressEntry),
          'EX',
          ttl,
          'NX',
        );
        if (result === 'OK') {
          return 'reserved';
        }
        const existing = await this.get(userId, idempotencyKey);
        if (!existing) {
          return 'reserved';
        }
        if (existing.inProgress) {
          return 'in_progress';
        }
        return existing;
      } catch (error) {
        this.logger.warn(`Redis reserve failed for idempotency key ${key}`);
        return 'reserved';
      }
    }

    const existing = this.store.get(key);
    if (existing && Date.now() <= existing.expiresAt) {
      if (existing.inProgress) {
        return 'in_progress';
      }
      return existing;
    }
    this.store.set(key, inProgressEntry);
    return 'reserved';
  }

  async complete(
    userId: string,
    idempotencyKey: string,
    entry: Omit<IdempotencyCacheEntry, 'expiresAt' | 'inProgress'>,
  ): Promise<void> {
    const key = this.getKey(userId, idempotencyKey);
    const value: IdempotencyCacheEntry = {
      ...entry,
      inProgress: false,
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

  async release(userId: string, idempotencyKey: string): Promise<void> {
    const key = this.getKey(userId, idempotencyKey);

    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (error) {
        this.logger.warn(`Redis release failed for idempotency key ${key}`);
      }
      return;
    }

    this.store.delete(key);
  }

  // Backwards-compatible for existing callers/tests
  async set(
    userId: string,
    idempotencyKey: string,
    entry: Omit<IdempotencyCacheEntry, 'expiresAt'>,
  ): Promise<void> {
    await this.complete(userId, idempotencyKey, {
      endpoint: entry.endpoint,
      statusCode: entry.statusCode,
      body: entry.body,
      requestHash: entry.requestHash,
    });
  }
}

export type IdempotencyCheckResult =
  | { state: 'proceed' }
  | { state: 'replay'; statusCode: number; body: any; replayed: boolean };

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    private readonly cache: IdempotencyRedisCache,
    @Optional()
    @InjectRepository(IdempotencyRecord)
    private readonly idempotencyRepository?: Repository<IdempotencyRecord>,
  ) {}

  generateRequestHash(body: any): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(body ?? {}));
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
    if (!cached || cached.inProgress) {
      return { match: true };
    }
    if (cached.endpoint === endpoint) {
      return { match: true, cached };
    }
    return { match: false, cached };
  }

  async beginIdempotency(
    key: string,
    userId: string,
    requestBody: any,
    endpoint: string,
  ): Promise<IdempotencyCheckResult> {
    const normalizedUserId = userId || 'anonymous';
    const requestHash = this.generateRequestHash(requestBody);
    const reservation = await this.cache.reserve(
      normalizedUserId,
      key,
      endpoint,
      requestHash,
    );

    if (reservation === 'in_progress') {
      throw new ConflictException('Idempotent request is already in progress');
    }

    if (reservation === 'reserved') {
      return { state: 'proceed' };
    }

    const cached = reservation as IdempotencyCacheEntry;
    if (cached.endpoint !== endpoint) {
      const error: any = new ConflictException(
        'Idempotency key already used for a different endpoint',
      );
      error.code = 'IDEMPOTENCY_KEY_CONFLICT';
      throw error;
    }
    if (cached.requestHash && cached.requestHash !== requestHash) {
      const error: any = new UnprocessableEntityException(
        'Idempotency key already used with a different request body',
      );
      error.code = 'IDEMPOTENCY_KEY_BODY_MISMATCH';
      throw error;
    }
    return {
      state: 'replay',
      statusCode: cached.statusCode,
      body: cached.body,
      replayed: true,
    };
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
      const requestHash = this.generateRequestHash(requestBody);
      if (cached.requestHash && cached.requestHash !== requestHash) {
        const error: any = new UnprocessableEntityException(
          'Idempotency key already used with a different request body',
        );
        error.code = 'IDEMPOTENCY_KEY_BODY_MISMATCH';
        throw error;
      }

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
    requestBody?: any,
  ): Promise<void> {
    const normalizedUserId = userId || 'anonymous';
    const requestHash =
      requestBody === undefined ? undefined : this.generateRequestHash(requestBody);

    await this.cache.complete(normalizedUserId, key, {
      endpoint,
      statusCode: responseStatus,
      body: responseBody,
      requestHash,
    });

    if (this.idempotencyRepository && requestHash) {
      try {
        await this.idempotencyRepository.save(
          this.idempotencyRepository.create({
            key,
            userId: normalizedUserId,
            endpoint,
            requestHash,
            responseStatus,
            responseBody,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }),
        );
      } catch (error) {
        this.logger.warn(`Failed to persist idempotency record for ${key}`);
      }
    }
  }

  async releaseIdempotency(key: string, userId: string): Promise<void> {
    const normalizedUserId = userId || 'anonymous';
    try {
      await this.cache.release(normalizedUserId, key);
    } catch (error) {
      this.logger.warn(`Failed to release idempotency key ${key}`);
    }
  }
}

