import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { REDIS_CLIENT } from '../modules/redis/redis.constants';
import { OAuthCodeService, OAUTH_CODE_TTL_SECONDS } from './oauth-code.service';

describe('OAuthCodeService', () => {
  let service: OAuthCodeService;
  let redis: { set: jest.Mock; getdel: jest.Mock };

  beforeEach(async () => {
    const store = new Map<string, string>();
    redis = {
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      getdel: jest.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthCodeService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<OAuthCodeService>(OAuthCodeService);
  });

  it('stores the payload under a prefixed key with a short TTL', async () => {
    const code = await service.issue({
      userId: 'user-1',
      requiresTwoFactor: false,
      isNew: true,
    });

    expect(code).toEqual(expect.any(String));
    expect(code.length).toBeGreaterThanOrEqual(40);
    expect(redis.set).toHaveBeenCalledWith(
      `auth:oauth:code:${code}`,
      JSON.stringify({ userId: 'user-1', requiresTwoFactor: false, isNew: true }),
      'EX',
      OAUTH_CODE_TTL_SECONDS,
    );
    expect(OAUTH_CODE_TTL_SECONDS).toBeLessThanOrEqual(60);
  });

  it('never stores a token in the payload', async () => {
    const code = await service.issue({
      userId: 'user-1',
      requiresTwoFactor: true,
      isNew: false,
    });
    const [, value] = redis.set.mock.calls[0];

    expect(value).not.toContain('accessToken');
    expect(value).not.toContain('refreshToken');
    expect(code).not.toMatch(/eyJ/);
  });

  it('returns the payload once and deletes it', async () => {
    const code = await service.issue({
      userId: 'user-1',
      requiresTwoFactor: false,
      isNew: false,
    });

    await expect(service.consume(code)).resolves.toEqual({
      userId: 'user-1',
      requiresTwoFactor: false,
      isNew: false,
    });
    await expect(service.consume(code)).resolves.toBeNull();
  });

  it('rejects an unknown code', async () => {
    await expect(service.consume('nope')).resolves.toBeNull();
  });

  it('rejects an empty code without touching redis', async () => {
    await expect(service.consume('')).resolves.toBeNull();
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it('returns null for a corrupted payload instead of throwing', async () => {
    redis.getdel.mockResolvedValueOnce('{not json');

    await expect(service.consume('broken')).resolves.toBeNull();
  });
});