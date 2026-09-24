import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { Inject } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly environment: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly configService: ConfigService,
  ) {
    this.environment =
      this.configService.get<string>('NODE_ENV') ?? 'development';
  }

  get rawClient(): Redis {
    return this.client;
  }

  key(module: string, key: string): string {
    return `nexafx:${this.environment}:${module}:${key}`;
  }

  refreshTokenKey(userId: string, tokenId: string): string {
    return `nexafx:refresh:${userId}:${tokenId}`;
  }

  async isReady(): Promise<boolean> {
    if (this.client.status === 'ready') return true;

    try {
      await this.client.connect();
      return (this.client.status as string) === 'ready';
    } catch (error) {
      this.logger.warn(
        `Redis unavailable; continuing with fallback behavior: ${this.message(error)}`,
      );
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!(await this.isReady())) return null;

    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!(await this.isReady())) return;

    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis SET failed for ${key}: ${this.message(error)}`);
    }
  }

  async setString(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    if (!(await this.isReady())) return;

    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis SET failed for ${key}: ${this.message(error)}`);
    }
  }

  async getString(key: string): Promise<string | null> {
    if (!(await this.isReady())) return null;

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async exists(key: string): Promise<boolean | null> {
    if (!(await this.isReady())) return null;

    try {
      return (await this.client.exists(key)) === 1;
    } catch (error) {
      this.logger.warn(
        `Redis EXISTS failed for ${key}: ${this.message(error)}`,
      );
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!(await this.isReady())) return;

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Redis DEL failed for ${key}: ${this.message(error)}`);
    }
  }

  async deleteByPattern(pattern: string): Promise<void> {
    if (!(await this.isReady())) return;

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

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => undefined);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
