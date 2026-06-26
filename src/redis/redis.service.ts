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
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis | null = null;
  private readonly useMemoryFallback: boolean;
  private readonly memoryStore = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly configService: ConfigService) {
    // Fall back to memory in test environment or if explicit fallback is enabled
    this.useMemoryFallback =
      this.configService.get<string>('NODE_ENV') === 'test' ||
      this.configService.get<string>('REDIS_FALLBACK') === 'true';
  }

  async onModuleInit() {
    if (this.useMemoryFallback) {
      this.logger.log(
        'RedisService is using in-memory fallback store (configured for test or fallback mode).',
      );
      return;
    }

    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD');

    try {
      this.redisClient = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });

      this.redisClient.on('error', (err) => {
        this.logger.warn(
          `Redis connection error: ${err.message}. Falling back to in-memory store.`,
        );
      });

      this.redisClient.on('connect', () => {
        this.logger.log(`Connected to Redis at ${host}:${port}`);
      });
    } catch (err) {
      this.logger.error(
        'Failed to initialize Redis client. Falling back to in-memory store.',
        err,
      );
      this.redisClient = null;
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (err) {
        // ignore
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (
      this.useMemoryFallback ||
      !this.redisClient ||
      this.redisClient.status !== 'ready'
    ) {
      const item = this.memoryStore.get(key);
      if (!item) return null;
      if (Date.now() > item.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      return item.value;
    }

    try {
      return await this.redisClient.get(key);
    } catch (err) {
      this.logger.error(`Redis GET error for key ${key}: ${err.message}`);
      // fallback to memory
      const item = this.memoryStore.get(key);
      if (item && Date.now() <= item.expiresAt) {
        return item.value;
      }
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.memoryStore.set(key, { value, expiresAt });

    if (
      this.useMemoryFallback ||
      !this.redisClient ||
      this.redisClient.status !== 'ready'
    ) {
      return;
    }

    try {
      if (ttlSeconds) {
        await this.redisClient.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.redisClient.set(key, value);
      }
    } catch (err) {
      this.logger.error(`Redis SET error for key ${key}: ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    this.memoryStore.delete(key);

    if (
      this.useMemoryFallback ||
      !this.redisClient ||
      this.redisClient.status !== 'ready'
    ) {
      return;
    }

    try {
      await this.redisClient.del(key);
    } catch (err) {
      this.logger.error(`Redis DEL error for key ${key}: ${err.message}`);
    }
  }
}
