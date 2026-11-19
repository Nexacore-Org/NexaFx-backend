import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthFailureFilter } from '../filters/oauth-failure.filter';
import { GoogleStrategy } from './google.strategy';
import { GithubStrategy } from './github.strategy';
import { RedisOAuthStateStore } from './redis-oauth-state.store';

const FAILURE_URL = 'http://localhost:3001/login?error=oauth_failed';

describe('OAuth state protection', () => {
  const data = new Map<string, string>();
  const redis = {
    get: jest.fn(async (key: string) => data.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  const store = new RedisOAuthStateStore(redis as any);

  beforeEach(() => {
    data.clear();
    jest.clearAllMocks();
  });

  it('stores a state for ten minutes and deletes it when verified', async () => {
    const state = await new Promise<string>((resolve, reject) => {
      store.store({}, {}, (error, value) =>
        error ? reject(error) : resolve(value!),
      );
    });

    expect(state).toEqual(expect.any(String));
    expect(redis.set).toHaveBeenCalledWith(
      `auth:oauth:state:${state}`,
      '1',
      'EX',
      600,
    );

    const verified = await new Promise<boolean>((resolve, reject) => {
      store.verify({}, state, {}, (error, ok) =>
        error ? reject(error) : resolve(Boolean(ok)),
      );
    });

    expect(verified).toBe(true);
    expect(redis.del).toHaveBeenCalledWith(`auth:oauth:state:${state}`);
    expect(data.size).toBe(0);
  });

  it('rejects forged and absent state', async () => {
    const verify = (provided: string) =>
      new Promise<boolean>((resolve, reject) => {
        store.verify({}, provided, {}, (error, ok) =>
          error ? reject(error) : resolve(Boolean(ok)),
        );
      });

    expect(await verify('')).toBe(false);
    expect(await verify('forged-state')).toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('uses the Redis store in both OAuth strategies', () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key.endsWith('CLIENT_ID')) return 'client-id';
        if (key.endsWith('CLIENT_SECRET')) return 'client-secret';
        return `http://localhost:3000/v1/auth/${key}`;
      }),
    } as unknown as ConfigService;

    const google = new GoogleStrategy(config, {} as any, store);
    const github = new GithubStrategy(config, {} as any, store);

    expect((google as any)._stateStore).toBe(store);
    expect((github as any)._stateStore).toBe(store);
  });

  it('puts a generated state in the authorization redirect', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'GOOGLE_CLIENT_ID'
          ? 'client-id'
          : key === 'GOOGLE_CLIENT_SECRET'
            ? 'client-secret'
            : 'http://localhost:3000/v1/auth/google/callback',
      ),
    } as unknown as ConfigService;
    const strategy = new GoogleStrategy(config, {} as any, store);
    const redirect = jest.fn();
    (strategy as any).redirect = redirect;

    strategy.authenticate({ query: {} } as any, {} as any);
    await new Promise((resolve) => setImmediate(resolve));

    expect(redirect).toHaveBeenCalled();
    const authorizeUrl = new URL(redirect.mock.calls[0][0]);
    expect(authorizeUrl.searchParams.get('state')).toEqual(expect.any(String));
  });

  it('redirects OAuth failures to the configured failure URL', () => {
    const filter = new OAuthFailureFilter({
      get: jest.fn((key: string, fallback?: string) =>
        key === 'OAUTH_FAILURE_REDIRECT' ? FAILURE_URL : fallback,
      ),
    } as unknown as ConfigService);
    const response = { redirect: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as any;

    filter.catch(new UnauthorizedException('Invalid state'), host);

    expect(response.redirect).toHaveBeenCalledWith(FAILURE_URL);
  });
});
