import { ConfigService } from '@nestjs/config';
import {
  getQueueRedisConnection,
  resetCachedQueueConnection,
} from './queue-connection';

describe('Queue Connection', () => {
  beforeEach(() => {
    resetCachedQueueConnection();
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_USERNAME;
    delete process.env.REDIS_DB;
    delete process.env.REDIS_TLS;
  });

  it('should return default connection options when no config or env provided', () => {
    const conn = getQueueRedisConnection();
    expect(conn.host).toBe('localhost');
    expect(conn.port).toBe(6379);
    expect(conn.db).toBe(0);
    expect(conn.maxRetriesPerRequest).toBeNull();
    expect(conn.enableReadyCheck).toBe(false);
  });

  it('should read connection parameters from ConfigService if available', () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const map: Record<string, any> = {
          REDIS_HOST: 'redis.internal.net',
          REDIS_PORT: 6380,
          REDIS_PASSWORD: 'secretpassword',
          REDIS_USERNAME: 'default',
          REDIS_DB: 2,
          REDIS_TLS: 'true',
        };
        return map[key];
      }),
    } as unknown as ConfigService;

    const conn = getQueueRedisConnection(mockConfigService, true);

    expect(conn.host).toBe('redis.internal.net');
    expect(conn.port).toBe(6380);
    expect(conn.password).toBe('secretpassword');
    expect(conn.username).toBe('default');
    expect(conn.db).toBe(2);
    expect(conn.tls).toEqual({});
    expect(conn.maxRetriesPerRequest).toBeNull();
  });

  it('should reuse cached configuration for subsequent calls unless forced', () => {
    const first = getQueueRedisConnection();
    const second = getQueueRedisConnection();
    expect(first).toBe(second);
  });

  it('should calculate exponential retry delay within bounds', () => {
    const conn = getQueueRedisConnection();
    expect(conn.retryStrategy(1)).toBe(100);
    expect(conn.retryStrategy(10)).toBe(1000);
    expect(conn.retryStrategy(50)).toBe(3000);
  });
});
