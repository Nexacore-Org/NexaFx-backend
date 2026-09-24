import { ConfigService } from '@nestjs/config';
import { GeoCacheService } from './geo-cache.service';

describe('GeoCacheService', () => {
  let service: GeoCacheService;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue(undefined), // no REDIS_URL → in-memory
    } as unknown as ConfigService;
    service = new GeoCacheService(config);
  });

  afterEach(async () => {
    await service.onModuleDestroy?.();
    jest.clearAllMocks();
  });

  it('stores and retrieves a login location (cache hit)', async () => {
    const loginAt = new Date();
    await service.set('user-1', 51.5074, -0.1278, loginAt);

    const cached = await service.get('user-1');
    expect(cached).not.toBeNull();
    expect(cached!.userId).toBe('user-1');
    expect(cached!.latitude).toBe(51.5074);
    expect(cached!.longitude).toBe(-0.1278);
  });

  it('returns null on cache miss', async () => {
    await expect(service.get('unknown-user')).resolves.toBeNull();
  });

  it('deletes a cached entry', async () => {
    await service.set('user-2', 40.7, -74.0, new Date());
    await service.del('user-2');
    await expect(service.get('user-2')).resolves.toBeNull();
  });

  it('expires entries past TTL via getFromMemory path', async () => {
    // Access private store to force an expired entry
    const store: Map<string, { data: any; expiresAt: number }> = (service as any).store;
    store.set('loc:user-exp', {
      data: {
        userId: 'user-exp',
        latitude: 1,
        longitude: 2,
        loginAt: new Date(),
      },
      expiresAt: Date.now() - 1000, // already expired
    });

    await expect(service.get('user-exp')).resolves.toBeNull();
  });
});
