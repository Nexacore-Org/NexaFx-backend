import { Injectable, Inject, Optional } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageRecord } from '@nestjs/throttler';
import { REDIS_CLIENT, REDIS_THROTTLER_PREFIX } from './redis.constants';
import { IRedisClientLike } from './redis.service';

export interface IEvaluableRedis extends IRedisClientLike {
  eval?: (
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ) => Promise<any>;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly prefix: string;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient: IEvaluableRedis | null,
    prefix: string = REDIS_THROTTLER_PREFIX,
  ) {
    this.prefix = prefix;
  }

  /**
   * Increments the count for a key and determines rate limit / block expiration.
   * Compatible with @nestjs/throttler / nestjs-throttler-storage-redis storage interface.
   */
  async increment(
    key: string,
    ttl: number, // in milliseconds
    limit: number,
    blockDuration: number, // in milliseconds
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const fullKey = `${this.prefix}${throttlerName}:${key}`;
    const blockKey = `${this.prefix}block:${throttlerName}:${key}`;

    if (!this.redisClient) {
      // Memory fallback / pass-through if redis is not available
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    // 1. Check if currently blocked
    if (blockDuration > 0) {
      const blockTtl = await this.redisClient.ttl(blockKey);
      if (blockTtl > 0) {
        return {
          totalHits: limit + 1,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire: blockTtl,
        };
      }
    }

    // 2. Increment hits
    const totalHits = await this.redisClient.incr(fullKey);

    // If first hit, set expiration
    if (totalHits === 1) {
      const ttlSec = Math.max(1, Math.ceil(ttl / 1000));
      await this.redisClient.expire(fullKey, ttlSec);
    }

    let timeToExpire = await this.redisClient.ttl(fullKey);
    if (timeToExpire < 0) {
      timeToExpire = Math.ceil(ttl / 1000);
    }

    const isBlocked = totalHits > limit;
    let timeToBlockExpire = 0;

    // 3. Apply block duration if exceeded
    if (isBlocked && blockDuration > 0) {
      const blockSec = Math.max(1, Math.ceil(blockDuration / 1000));
      await this.redisClient.set(blockKey, '1', 'EX', blockSec);
      timeToBlockExpire = blockSec;
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
