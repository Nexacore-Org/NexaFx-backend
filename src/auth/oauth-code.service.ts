import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../modules/redis/redis.constants';

export const OAUTH_CODE_TTL_SECONDS = 60;

const key = (code: string) => `auth:oauth:code:${code}`;

export interface OAuthCodePayload {
  userId: string;
  requiresTwoFactor: boolean;
  isNew: boolean;
}

/**
 * One-time authorisation codes handed to the browser after an OAuth redirect.
 *
 * The callback used to append the access and refresh tokens to the redirect
 * URL, which leaks long-lived credentials into browser history, server logs
 * and Referer headers. The redirect now carries a short-lived code that is
 * exchanged over POST, exactly once.
 */
@Injectable()
export class OAuthCodeService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async issue(payload: OAuthCodePayload): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(
      key(code),
      JSON.stringify(payload),
      'EX',
      OAUTH_CODE_TTL_SECONDS,
    );
    return code;
  }

  /**
   * Returns the payload for a code and deletes it, so a replayed redirect
   * cannot obtain a second set of tokens.
   */
  async consume(code: string): Promise<OAuthCodePayload | null> {
    if (!code) {
      return null;
    }

    const raw = await this.redis.getdel(key(code));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as OAuthCodePayload;
    } catch {
      return null;
    }
  }
}