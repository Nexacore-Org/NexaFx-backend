import {
  buildThrottlerOptions,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_SECONDS,
} from './throttler.config';

interface ThrottlerOption {
  ttl: number;
  limit: number;
}

const first = (env: Record<string, string | undefined>): ThrottlerOption =>
  (buildThrottlerOptions(env) as ThrottlerOption[])[0];

describe('buildThrottlerOptions', () => {
  it('coerces string env values and converts the documented seconds to milliseconds (60 -> 60000)', () => {
    const options = buildThrottlerOptions({
      THROTTLE_TTL: '60',
      THROTTLE_LIMIT: '100',
    });

    expect(options).toEqual([{ ttl: 60000, limit: 100 }]);
    expect(typeof first({ THROTTLE_TTL: '60' }).ttl).toBe('number');
    expect(typeof first({ THROTTLE_LIMIT: '100' }).limit).toBe('number');
  });

  it('never returns a string ttl (regression: Date.now() + "60")', () => {
    const [option] = buildThrottlerOptions({
      THROTTLE_TTL: '60',
      THROTTLE_LIMIT: '100',
    }) as ThrottlerOption[];

    expect(typeof option.ttl).toBe('number');
    expect(Number.isFinite(first({ THROTTLE_TTL: '60' }).ttl)).toBe(true);
    expect(first({ THROTTLE_TTL: '60' }).ttl).toBe(60_000);
  });

  it('falls back to the documented defaults when the values are missing', () => {
    expect(buildThrottlerOptions({})).toEqual([
      {
        ttl: DEFAULT_THROTTLE_TTL_SECONDS * 1000,
        limit: DEFAULT_THROTTLE_LIMIT,
      },
    ]);
  });

  it('falls back when a value is not a usable positive number', () => {
    expect(first({ THROTTLE_TTL: 'not-a-number' }).ttl).toBe(
      DEFAULT_THROTTLE_TTL_SECONDS * 1000,
    );
    expect(first({ THROTTLE_TTL: '0' }).ttl).toBe(
      DEFAULT_THROTTLE_TTL_SECONDS * 1000,
    );
    expect(first({ THROTTLE_TTL: '-5' }).ttl).toBe(
      DEFAULT_THROTTLE_TTL_SECONDS * 1000,
    );
    expect(first({ THROTTLE_LIMIT: 'lots' }).limit).toBe(
      DEFAULT_THROTTLE_LIMIT,
    );
  });

  it('accepts already-numeric values', () => {
    expect(
      buildThrottlerOptions({ THROTTLE_TTL: 30, THROTTLE_LIMIT: 7 }),
    ).toEqual([{ ttl: 30_000, limit: 7 }]);
  });
});
