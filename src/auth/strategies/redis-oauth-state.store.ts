import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../modules/redis/redis.constants';

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `auth:oauth:state:${state}`;

@Injectable()
export class RedisOAuthStateStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  store(
    req: any,
    callback: (error: any, state?: string) => void,
  ): Promise<void>;
  store(
    req: any,
    meta: any,
    callback: (error: any, state?: string) => void,
  ): Promise<void>;
  async store(
    req: any,
    metaOrCallback: any,
    maybeCallback?: (error: any, state?: string) => void,
  ): Promise<void> {
    const callback =
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback!;
    try {
      const state = randomBytes(32).toString('base64url');
      await this.redis.set(stateKey(state), '1', 'EX', STATE_TTL_SECONDS);
      callback(null, state);
    } catch (error) {
      callback(error);
    }
  }

  verify(
    req: any,
    provided: string,
    callback: (error: any, ok?: boolean, state?: any) => void,
  ): Promise<void>;
  verify(
    req: any,
    provided: string,
    meta: any,
    callback: (error: any, ok?: boolean, state?: any) => void,
  ): Promise<void>;
  async verify(
    req: any,
    provided: string,
    metaOrCallback: any,
    maybeCallback?: (error: any, ok?: boolean, state?: any) => void,
  ): Promise<void> {
    const callback =
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback!;
    try {
      if (!provided) {
        callback(null, false);
        return;
      }

      const stored = await this.redis.get(stateKey(provided));
      if (!stored) {
        callback(null, false);
        return;
      }

      await this.redis.del(stateKey(provided));
      callback(null, true, stored);
    } catch (error) {
      callback(error);
    }
  }
}
