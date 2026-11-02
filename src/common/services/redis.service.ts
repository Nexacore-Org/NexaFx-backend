import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly memoryFallback = new Map<
    string,
    { value: string; expiresAt?: number }
  >();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const isTest = this.configService.get<string>('NODE_ENV') === 'test';
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: isTest ? 1 : null,
      lazyConnect: isTest,
      enableOfflineQueue: !isTest,
    });

    this.client.on('connect', () => {
      this.logger.log('Successfully connected to Redis');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryFallback.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (
        this.client &&
        (!('status' in this.client) || this.client.status === 'ready')
      ) {
        const data = await this.client.get(key);
        if (!data) return this.getFromMemory<T>(key);
        return JSON.parse(data) as T;
      }
      return this.getFromMemory<T>(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key} from Redis`, error);
      return this.getFromMemory<T>(key);
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    this.memoryFallback.set(key, {
      value: serialized,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
    try {
      if (
        this.client &&
        (!('status' in this.client) || this.client.status === 'ready')
      ) {
        if (ttlSeconds) {
          await this.client.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, serialized);
        }
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key} in Redis`, error);
    }
  }

  async del(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    try {
      if (
        this.client &&
        (!('status' in this.client) || this.client.status === 'ready')
      ) {
        await this.client.del(key);
      }
    } catch (error) {
      this.logger.error(`Error deleting key ${key} from Redis`, error);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const matchedKeys = await this.scan(pattern);
      if (matchedKeys.length > 0) {
        for (const k of matchedKeys) {
          this.memoryFallback.delete(k);
        }
        if (
          this.client &&
          (!('status' in this.client) || this.client.status === 'ready')
        ) {
          await this.client.del(...matchedKeys);
        }
      }
    } catch (error) {
      this.logger.error(`Error deleting pattern ${pattern} from Redis`, error);
    }
  }

  /**
   * Non-blocking cursor-based iteration over keys matching a glob pattern.
   * Uses Redis SCAN instead of blocking KEYS.
   */
  async scan(pattern: string, count = 100): Promise<string[]> {
    const found = new Set<string>();
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
    );

    for (const [k, entry] of this.memoryFallback.entries()) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.memoryFallback.delete(k);
        continue;
      }
      if (regex.test(k)) {
        found.add(k);
      }
    }

    try {
      if (
        this.client &&
        (!('status' in this.client) || this.client.status === 'ready')
      ) {
        let cursor = '0';
        do {
          const [nextCursor, batch] = await this.client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            count,
          );
          cursor = nextCursor;
          for (const key of batch) {
            found.add(key);
          }
        } while (cursor !== '0');
      }
    } catch (error) {
      this.logger.error(`Error scanning keys for pattern ${pattern}`, error);
    }

    return Array.from(found);
  }

  /**
   * Alias for scan() retained for backwards compatibility without using blocking KEYS.
   */
  async keys(pattern: string): Promise<string[]> {
    return this.scan(pattern);
  }
}
