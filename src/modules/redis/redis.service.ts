import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface RedisHealthCheckResult {
  isHealthy: boolean;
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly environment: string;
  private readonly connectTimeoutMs: number;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly client: Redis | null = null,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.environment =
      this.configService?.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development';
    const timeout = Number(
      this.configService?.get<string | number>('REDIS_CONNECT_TIMEOUT_MS') ??
        process.env.REDIS_CONNECT_TIMEOUT_MS ??
        1000,
    );
    this.connectTimeoutMs =
      Number.isFinite(timeout) && timeout > 0 ? timeout : 1000;
  }

  get rawClient(): Redis | null {
    return this.client;
  }

  key(module: string, key: string): string {
    return `nexafx:${this.environment}:${module}:${key}`;
  }

  refreshTokenKey(userId: string, tokenId: string): string {
    return `nexafx:refresh:${userId}:${tokenId}`;
  }

  async isReady(): Promise<boolean> {
    if (!this.client) return false;
    const status = (this.client as { status?: string }).status;
    if (status === 'ready') return true;
    if (typeof this.client.connect !== 'function') return true;
    if (status === 'connecting' || status === 'reconnecting') return false;

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.client.connect(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Redis connect timed out after ${this.connectTimeoutMs}ms`,
                ),
              ),
            this.connectTimeoutMs,
          );
        }),
      ]);
      return (this.client as { status?: string }).status === 'ready';
    } catch (error) {
      this.logger.warn(
        `Redis unavailable; continuing with fallback behavior: ${this.message(error)}`,
      );
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async get<T = string>(key: string): Promise<T | null> {
    if (!(await this.isReady()) || !this.client) return null;

    try {
      const value = await this.client.get(key);
      if (value === null || value === undefined) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<boolean> {
    if (!(await this.isReady()) || !this.client) return false;

    try {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      this.logger.warn(`Redis SET failed for ${key}: ${this.message(error)}`);
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!(await this.isReady()) || !this.client) return null;

    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<boolean> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async setString(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.set(key, value, ttlSeconds);
  }

  async getString(key: string): Promise<string | null> {
    if (!(await this.isReady()) || !this.client) return null;

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0 || !(await this.isReady()) || !this.client) return 0;

    try {
      return await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(
        `Redis DEL failed for ${keys.join(', ')}: ${this.message(error)}`,
      );
      return 0;
    }
  }

  async delete(key: string): Promise<void> {
    await this.del(key);
  }

  async scanKeys(pattern: string): Promise<string[]> {
    if (!(await this.isReady()) || !this.client) return [];

    const matched: string[] = [];
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) matched.push(...keys);
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Redis SCAN failed for ${pattern}: ${this.message(error)}`,
      );
      return [];
    }
    return matched;
  }

  async keys(pattern: string): Promise<string[]> {
    return this.scanKeys(pattern);
  }

  async deleteByPattern(pattern: string): Promise<void> {
    if (!(await this.isReady()) || !this.client) return;

    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Redis pattern DEL failed for ${pattern}: ${this.message(error)}`,
      );
    }
  }

  async delPattern(pattern: string): Promise<void> {
    await this.deleteByPattern(pattern);
  }

  async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0 || !(await this.isReady()) || !this.client) return 0;

    try {
      return await this.client.exists(...keys);
    } catch (error) {
      this.logger.warn(
        `Redis EXISTS failed for ${keys.join(', ')}: ${this.message(error)}`,
      );
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!(await this.isReady()) || !this.client) return false;

    try {
      return (await this.client.expire(key, ttlSeconds)) === 1;
    } catch (error) {
      this.logger.warn(
        `Redis EXPIRE failed for ${key}: ${this.message(error)}`,
      );
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!(await this.isReady()) || !this.client) return -2;

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.warn(`Redis TTL failed for ${key}: ${this.message(error)}`);
      return -2;
    }
  }

  async incr(key: string): Promise<number> {
    if (!(await this.isReady()) || !this.client) return 0;

    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.warn(`Redis INCR failed for ${key}: ${this.message(error)}`);
      return 0;
    }
  }

  async healthCheck(): Promise<RedisHealthCheckResult> {
    if (!this.client) {
      return { isHealthy: false, error: 'Redis client is not configured' };
    }

    const start = Date.now();
    try {
      const pong = await this.client.ping();
      if (pong === 'PONG') {
        return { isHealthy: true, latencyMs: Date.now() - start };
      }
      return {
        isHealthy: false,
        error: `Unexpected Redis PING response: ${String(pong)}`,
      };
    } catch (error) {
      return { isHealthy: false, error: this.message(error) };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && (this.client as { status?: string }).status !== 'end') {
      await this.client.quit().catch(() => undefined);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
