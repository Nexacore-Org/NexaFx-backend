import { ThrottlerModuleOptions } from '@nestjs/throttler';

/** Documented default rate-limit window (README / .env.example): 60 seconds. */
export const DEFAULT_THROTTLE_TTL_SECONDS = 60;

/** Documented default request allowance per window. */
export const DEFAULT_THROTTLE_LIMIT = 100;

export interface ThrottleEnv {
  THROTTLE_TTL?: string | number;
  THROTTLE_LIMIT?: string | number;
}

/**
 * Coerce an environment value to a positive integer.
 *
 * Environment variables are always strings, so `Number()` is mandatory before
 * the value reaches `@nestjs/throttler` (which does `Date.now() + ttl`): the
 * string `'60'` would otherwise produce `Date.now() + '60'`, i.e. a nonsense
 * millisecond timestamp far in the future that locks the client out until the
 * process restarts.
 */
function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

/**
 * Build the global throttler options from the environment.
 *
 * `THROTTLE_TTL` is documented in **seconds** (README "Rate Limiting" table and
 * `.env.example`), while `@nestjs/throttler` expects **milliseconds**, so the
 * parsed value is multiplied by 1000 to match the documented unit.
 */
export function buildThrottlerOptions(
  env: ThrottleEnv = process.env,
): ThrottlerModuleOptions {
  const ttlSeconds = parsePositiveInt(
    env.THROTTLE_TTL,
    DEFAULT_THROTTLE_TTL_SECONDS,
  );
  const limit = parsePositiveInt(env.THROTTLE_LIMIT, DEFAULT_THROTTLE_LIMIT);

  return [
    {
      ttl: ttlSeconds * 1000,
      limit,
    },
  ];
}
