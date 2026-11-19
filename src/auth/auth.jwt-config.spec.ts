import type { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../common/helpers/jwt-secret';

const configWith = (values: Record<string, string | undefined>): ConfigService =>
  ({
    get: (key: string) => values[key],
  }) as unknown as ConfigService;

describe('JWT secret configuration', () => {
  it('fails when JWT_SECRET is missing outside development/test', () => {
    expect(() =>
      resolveJwtSecret(configWith({ NODE_ENV: 'staging' })),
    ).toThrow(/JWT_SECRET/);
  });

  it('fails when NODE_ENV is unset and JWT_SECRET is missing', () => {
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(() => resolveJwtSecret(configWith({}))).toThrow(/JWT_SECRET/);
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });

  it('fails when JWT_SECRET is too short outside development/test', () => {
    expect(() =>
      resolveJwtSecret(
        configWith({ NODE_ENV: 'staging', JWT_SECRET: 'short-secret' }),
      ),
    ).toThrow(/at least 32/);
  });

  it('uses a local fallback only in development and test', () => {
    expect(
      resolveJwtSecret(configWith({ NODE_ENV: 'development' })).length,
    ).toBeGreaterThanOrEqual(32);
    expect(resolveJwtSecret(configWith({ NODE_ENV: 'test' }))).toBe(
      resolveJwtSecret(configWith({ NODE_ENV: 'development' })),
    );
  });
});
