import { RedisThrottlerStorage } from './redis-throttler.storage';
import { createMockRedisClient } from '../../../test/mocks/factories';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let mockClient: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    mockClient = createMockRedisClient();
    storage = new RedisThrottlerStorage(mockClient as any, 'test-throttler:');
  });

  it('should increment hits on first request and set TTL', async () => {
    mockClient.ttl.mockResolvedValue(60);
    mockClient.incr.mockResolvedValue(1);

    const record = await storage.increment('ip-127.0.0.1', 60000, 10, 0, 'default');

    expect(record.totalHits).toBe(1);
    expect(record.isBlocked).toBe(false);
    expect(record.timeToExpire).toBe(60);
    expect(mockClient.incr).toHaveBeenCalledWith('test-throttler:default:ip-127.0.0.1');
    expect(mockClient.expire).toHaveBeenCalledWith(
      'test-throttler:default:ip-127.0.0.1',
      60,
    );
  });

  it('should track subsequent hits without resetting expiration', async () => {
    mockClient.ttl.mockResolvedValue(45);
    mockClient.incr.mockResolvedValue(5);

    const record = await storage.increment('ip-127.0.0.1', 60000, 10, 0, 'default');

    expect(record.totalHits).toBe(5);
    expect(record.isBlocked).toBe(false);
    expect(record.timeToExpire).toBe(45);
    expect(mockClient.expire).not.toHaveBeenCalled();
  });

  it('should flag isBlocked when totalHits exceeds the limit and set block key', async () => {
    mockClient.ttl.mockResolvedValue(30);
    mockClient.incr.mockResolvedValue(11); // limit is 10

    const record = await storage.increment(
      'ip-127.0.0.1',
      60000,
      10,
      300000, // 5 min block duration
      'default',
    );

    expect(record.totalHits).toBe(11);
    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(300);
    expect(mockClient.set).toHaveBeenCalledWith(
      'test-throttler:block:default:ip-127.0.0.1',
      '1',
      'EX',
      300,
    );
  });

  it('should reject immediately if caller is currently blocked', async () => {
    // blockKey returns remaining TTL > 0
    mockClient.ttl.mockResolvedValueOnce(250);

    const record = await storage.increment(
      'ip-127.0.0.1',
      60000,
      10,
      300000,
      'default',
    );

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(250);
    expect(record.totalHits).toBe(11);
    expect(mockClient.incr).not.toHaveBeenCalled();
  });

  it('should fallback gracefully when Redis client is not provided', async () => {
    const fallbackStorage = new RedisThrottlerStorage(null);

    const record = await fallbackStorage.increment('ip-127.0.0.1', 60000, 10, 0, 'default');

    expect(record.totalHits).toBe(1);
    expect(record.isBlocked).toBe(false);
    expect(record.timeToExpire).toBe(60);
  });
});
