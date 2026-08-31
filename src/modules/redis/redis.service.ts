import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { REDIS_CLIENT, REDIS_DEFAULT_TTL } from './redis.constants';

export interface RedisHealthStatus {
  isHealthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface IRedisClientLike {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ...args: any[]) => Promise<string | null>;
  del: (...keys: string[]) => Promise<number>;
  exists: (...keys: string[]) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number | boolean>;
  ttl: (key: string) => Promise<number>;
  incr: (key: string) => Promise<number>;
  ping: () => Promise<string>;
  quit?: () => Promise<string>;
  disconnect?: () => void;
  status?: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly client: IRedisClientLike | null,
  ) {}

  /**
   * Retrieves raw string value for a key with graceful degradation if client fails or is disconnected.
   */
  async get(key: string): Promise<string | null> {
    if (!this.isClientAvailable()) {
      this.logger.warn(`Redis client unavailable. Skipping get for key: ${key}`);
      return null;
    }
    try {
      return await this.client!.get(key);
    } catch (error) {
      this.logger.error(`Error retrieving key '${key}' from Redis:`, error);
      return null;
    }
  }

  /**
   * Sets value with optional TTL (in seconds) without throwing unhandled exceptions.
   */
  async set(
    key: string,
    value: string,
    ttlSeconds: number = REDIS_DEFAULT_TTL,
  ): Promise<boolean> {
    if (!this.isClientAvailable()) {
      this.logger.warn(`Redis client unavailable. Skipping set for key: ${key}`);
      return false;
    }
    try {
      if (ttlSeconds > 0) {
        await this.client!.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client!.set(key, value);
      }
      return true;
    } catch (error) {
      this.logger.error(`Error setting key '${key}' in Redis:`, error);
      return false;
    }
  }

  /**
   * Serializes and sets a JSON object.
   */
  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      return await this.set(key, serialized, ttlSeconds);
    } catch (error) {
      this.logger.error(`Failed to serialize JSON for key '${key}':`, error);
      return false;
    }
  }

  /**
   * Retrieves and deserializes a JSON object.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.error(`Failed to parse JSON for key '${key}':`, error);
      return null;
    }
  }

  /**
   * Deletes one or more keys.
   */
  async del(...keys: string[]): Promise<number> {
    if (!this.isClientAvailable() || keys.length === 0) return 0;
    try {
      return await this.client!.del(...keys);
    } catch (error) {
      this.logger.error(`Error deleting keys from Redis:`, error);
      return 0;
    }
  }

  /**
   * Checks if keys exist.
   */
  async exists(...keys: string[]): Promise<number> {
    if (!this.isClientAvailable() || keys.length === 0) return 0;
    try {
      return await this.client!.exists(...keys);
    } catch (error) {
      this.logger.error(`Error checking exists for keys in Redis:`, error);
      return 0;
    }
  }

  /**
   * Sets TTL expiration on a key.
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.isClientAvailable()) return false;
    try {
      const result = await this.client!.expire(key, seconds);
      return result === 1 || result === true;
    } catch (error) {
      this.logger.error(`Error expiring key '${key}' in Redis:`, error);
      return false;
    }
  }

  /**
   * Returns remaining TTL for a key in seconds.
   */
  async ttl(key: string): Promise<number> {
    if (!this.isClientAvailable()) return -2;
    try {
      return await this.client!.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key '${key}' in Redis:`, error);
      return -2;
    }
  }

  /**
   * Increments the number stored at key by one.
   */
  async incr(key: string): Promise<number> {
    if (!this.isClientAvailable()) return 0;
    try {
      return await this.client!.incr(key);
    } catch (error) {
      this.logger.error(`Error incrementing key '${key}' in Redis:`, error);
      return 0;
    }
  }

  /**
   * Performs a healthcheck ping and calculates response latency.
   */
  async healthCheck(): Promise<RedisHealthStatus> {
    if (!this.isClientAvailable()) {
      return {
        isHealthy: false,
        error: 'Redis client is not configured or unavailable',
      };
    }
    const start = Date.now();
    try {
      const pingResult = await this.client!.ping();
      const latencyMs = Date.now() - start;
      const isHealthy = pingResult === 'PONG';
      return {
        isHealthy,
        latencyMs,
      };
    } catch (error: any) {
      return {
        isHealthy: false,
        error: error?.message || 'Failed to ping Redis',
      };
    }
  }

  /**
   * Checks if Redis client instance is present.
   */
  private isClientAvailable(): boolean {
    return !!this.client;
  }

  /**
   * Graceful disconnection on application shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        if (typeof this.client.quit === 'function') {
          await this.client.quit();
        } else if (typeof this.client.disconnect === 'function') {
          this.client.disconnect();
        }
      } catch (err) {
        this.logger.warn('Error closing Redis connection:', err);
      }
    }
  }
}
