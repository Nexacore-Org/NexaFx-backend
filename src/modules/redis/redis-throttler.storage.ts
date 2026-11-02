import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

const THROTTLE_INCREMENT_SCRIPT = `
local hits = redis.call("INCR", KEYS[1])
if hits == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local pttl = redis.call("PTTL", KEYS[1])
if pttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return { hits, pttl }
`;

@Injectable()
export class RedisThrottlerStorage
  extends ThrottlerStorageService
  implements ThrottlerStorage
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis | null = null,
  ) {
    super();
  }

  override async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number = ttl,
    throttlerName: string = 'default',
  ): Promise<ThrottlerStorageRecord> {
    if (
      this.redisClient &&
      (this.redisClient as { status?: string }).status === 'ready' &&
      typeof this.redisClient.eval === 'function'
    ) {
      try {
        const result = (await this.redisClient.eval(
          THROTTLE_INCREMENT_SCRIPT,
          1,
          `nexafx:throttle:${throttlerName}:${key}`,
          String(ttl),
        )) as [number | string, number | string];

        const totalHits = Number(result?.[0] ?? 1);
        const pttlMs = Math.max(0, Number(result?.[1] ?? ttl));
        const timeToExpire = Math.max(1, Math.ceil(pttlMs / 1000));
        const isBlocked = totalHits > limit;
        const blockDurationMs = blockDuration > 0 ? blockDuration : ttl;
        const timeToBlockExpire = isBlocked
          ? Math.max(1, Math.ceil(blockDurationMs / 1000))
          : 0;

        this.storage.set(key, {
          totalHits: new Map([[throttlerName, totalHits]]),
          expiresAt: Date.now() + pttlMs,
          blockExpiresAt: isBlocked ? Date.now() + blockDurationMs : 0,
          isBlocked,
        });

        return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Redis throttler storage failed for ${key}; falling back to in-memory: ${msg}`,
        );
      }
    }

    return super.increment(key, ttl, limit, blockDuration, throttlerName);
  }
}
