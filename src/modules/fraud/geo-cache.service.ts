import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface LoginLocation {
  userId: string;
  latitude: number;
  longitude: number;
  loginAt: Date;
}

@Injectable()
export class GeoCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(GeoCacheService.name);
  private readonly TTL_MS = 24 * 60 * 60 * 1000;
  private readonly store = new Map<
    string,
    { data: LoginLocation; expiresAt: number }
  >();
  private redis: any = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initRedis();
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  private async initRedis() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL not set — using in-memory store for login locations.',
      );
      return;
    }

    try {
      const Redis = (await import('ioredis')).default;
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      });

      await this.redis.connect();
      this.logger.log('Redis connected for login location cache');
    } catch (error) {
      this.logger.warn(
        `Redis unavailable (${error instanceof Error ? error.message : String(error)}) — using in-memory fallback for login locations.`,
      );
      this.redis = null;
    }
  }

  async set(
    userId: string,
    latitude: number,
    longitude: number,
    loginAt: Date,
  ): Promise<void> {
    const value: LoginLocation = { userId, latitude, longitude, loginAt };
    const key = this.buildKey(userId);

    if (this.redis) {
      try {
        await this.redis.setex(key, this.TTL_MS / 1000, JSON.stringify(value));
        return;
      } catch {
        this.fallbackToMemory(key, value);
      }
    } else {
      this.fallbackToMemory(key, value);
    }
  }

  async get(userId: string): Promise<LoginLocation | null> {
    const key = this.buildKey(userId);

    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return this.getFromMemory(key);
      }
    }

    return this.getFromMemory(key);
  }

  async del(userId: string): Promise<void> {
    const key = this.buildKey(userId);

    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        this.store.delete(key);
      }
    } else {
      this.store.delete(key);
    }
  }

  private buildKey(userId: string): string {
    return `login_location:${userId}`;
  }

  private fallbackToMemory(key: string, value: LoginLocation): void {
    this.store.set(key, { data: value, expiresAt: Date.now() + this.TTL_MS });
  }

  private getFromMemory(key: string): LoginLocation | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}
