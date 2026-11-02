jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    get = jest.fn();
  },
}));
jest.mock('../../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('typeorm', () => ({
  Repository: class Repository {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RedisService } from './redis.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { createMockRedisClient } from '../../../test/mocks/factories';

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    mockClient = createMockRedisClient();
    service = new RedisService(mockClient as any);
  });

  describe('Basic Operations', () => {
    it('should get value for key', async () => {
      mockClient.get.mockResolvedValue('test-val');
      const result = await service.get('my-key');
      expect(result).toBe('test-val');
      expect(mockClient.get).toHaveBeenCalledWith('my-key');
    });

    it('should set value with TTL', async () => {
      mockClient.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'my-value', 120);
      expect(result).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith(
        'my-key',
        'my-value',
        'EX',
        120,
      );
    });

    it('should set value without TTL if 0', async () => {
      mockClient.set.mockResolvedValue('OK');
      const result = await service.set('my-key', 'my-value', 0);
      expect(result).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith('my-key', 'my-value');
    });

    it('should delete keys and return count', async () => {
      mockClient.del.mockResolvedValue(2);
      const count = await service.del('k1', 'k2');
      expect(count).toBe(2);
      expect(mockClient.del).toHaveBeenCalledWith('k1', 'k2');
    });

    it('should check if keys exist', async () => {
      mockClient.exists.mockResolvedValue(1);
      const count = await service.exists('k1');
      expect(count).toBe(1);
      expect(mockClient.exists).toHaveBeenCalledWith('k1');
    });

    it('should set expire TTL on key', async () => {
      mockClient.expire.mockResolvedValue(1);
      const ok = await service.expire('k1', 60);
      expect(ok).toBe(true);
      expect(mockClient.expire).toHaveBeenCalledWith('k1', 60);
    });

    it('should return TTL for key', async () => {
      mockClient.ttl.mockResolvedValue(300);
      const ttl = await service.ttl('k1');
      expect(ttl).toBe(300);
      expect(mockClient.ttl).toHaveBeenCalledWith('k1');
    });

    it('should increment key', async () => {
      mockClient.incr.mockResolvedValue(5);
      const count = await service.incr('k1');
      expect(count).toBe(5);
      expect(mockClient.incr).toHaveBeenCalledWith('k1');
    });

    it('scans keys and deletes patterns via SCAN without issuing KEYS (#1527)', async () => {
      expect(
        existsSync(join(__dirname, '../../common/services/redis.service.ts')),
      ).toBe(false);
      expect(
        readFileSync(join(__dirname, 'redis.service.ts'), 'utf8'),
      ).not.toMatch(/this\.client\.keys\s*\(/);

      mockClient.scan
        .mockResolvedValueOnce(['42', ['nexafx:imp:1', 'nexafx:imp:2']])
        .mockResolvedValueOnce(['0', ['nexafx:imp:3']]);
      expect(await service.keys('nexafx:imp:*')).toEqual([
        'nexafx:imp:1',
        'nexafx:imp:2',
        'nexafx:imp:3',
      ]);

      mockClient.scan
        .mockResolvedValueOnce(['17', ['cache:1', 'cache:2']])
        .mockResolvedValueOnce(['0', []]);
      await service.delPattern('cache:*');
      expect(mockClient.del).toHaveBeenCalledWith('cache:1', 'cache:2');
    });
  });

  describe('JSON Serialization Helpers', () => {
    it('should serialize and set JSON object', async () => {
      const data = { foo: 'bar', count: 42 };
      mockClient.set.mockResolvedValue('OK');

      const ok = await service.setJson('json-key', data, 60);
      expect(ok).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith(
        'json-key',
        JSON.stringify(data),
        'EX',
        60,
      );
    });

    it('should get and deserialize JSON object', async () => {
      const data = { user: 'alice', tier: 'PRO' };
      mockClient.get.mockResolvedValue(JSON.stringify(data));

      const parsed = await service.getJson<typeof data>('json-key');
      expect(parsed).toEqual(data);
    });

    it('should return null if key not found or malformed JSON', async () => {
      mockClient.get.mockResolvedValue('{bad-json');
      const parsed = await service.getJson('json-key');
      expect(parsed).toBeNull();
    });
  });

  describe('Connection Failure & Error Resilience', () => {
    it('should gracefully handle get error without throwing or crashing caller', async () => {
      mockClient.get.mockRejectedValue(new Error('Connection lost'));
      const result = await service.get('failing-key');
      expect(result).toBeNull();
    });

    it('should gracefully handle set error without throwing or crashing caller', async () => {
      mockClient.set.mockRejectedValue(new Error('Redis readonly replica'));
      const result = await service.set('failing-key', 'val');
      expect(result).toBe(false);
    });

    it('should gracefully handle del error without throwing', async () => {
      mockClient.del.mockRejectedValue(new Error('Socket closed'));
      const result = await service.del('failing-key');
      expect(result).toBe(0);
    });

    it('should handle unconfigured/null client gracefully for all operations', async () => {
      const unconfiguredService = new RedisService(null);

      expect(await unconfiguredService.get('k')).toBeNull();
      expect(await unconfiguredService.set('k', 'v')).toBe(false);
      expect(await unconfiguredService.del('k')).toBe(0);
      expect(await unconfiguredService.exists('k')).toBe(0);
      expect(await unconfiguredService.expire('k', 60)).toBe(false);
      expect(await unconfiguredService.ttl('k')).toBe(-2);
      expect(await unconfiguredService.incr('k')).toBe(0);
      expect(await unconfiguredService.keys('k:*')).toEqual([]);
    });

    it('completes JwtStrategy.validate within configured timeout and degrades RedisThrottlerStorage when Redis is down', async () => {
      const stopped = {
        ...createMockRedisClient(),
        status: 'wait',
        connect: jest.fn(() => new Promise<void>(() => {})),
      };
      const cfg = {
        get: jest.fn((k: string) =>
          k === 'REDIS_CONNECT_TIMEOUT_MS' ? 40 : 'test-secret',
        ),
      };
      const users = {
        findById: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'u1@example.com',
          role: 'USER',
          isSuspended: false,
          isDeleted: false,
          isActive: true,
        }),
      };

      const degraded = new RedisService(stopped as any, cfg as any);
      const strategy = new JwtStrategy(cfg as any, users as any, degraded);

      const start = Date.now();
      const user = await strategy.validate({
        sub: 'u1',
        email: 'u1@example.com',
        role: 'USER',
        jti: 'jti-1',
      });
      expect(Date.now() - start).toBeLessThan(400);
      expect(user.userId).toBe('u1');

      mockClient.get.mockResolvedValueOnce('true');
      const liveStrategy = new JwtStrategy(cfg as any, users as any, service);
      await expect(
        liveStrategy.validate({
          sub: 'u1',
          email: 'u1@example.com',
          role: 'USER',
          jti: 'revoked',
        }),
      ).rejects.toThrow(UnauthorizedException);

      mockClient.eval.mockResolvedValueOnce([2, 30_000]);
      const readyStorage = new RedisThrottlerStorage(mockClient as any);
      expect(
        (await readyStorage.increment('user:u1', 60_000, 5)).totalHits,
      ).toBe(2);

      const fallbackStorage = new RedisThrottlerStorage(stopped as any);
      expect(
        (await fallbackStorage.increment('user:u2', 60_000, 1)).isBlocked,
      ).toBe(false);
      expect(
        (await fallbackStorage.increment('user:u2', 60_000, 1)).isBlocked,
      ).toBe(true);
      fallbackStorage.onApplicationShutdown();
    });
  });

  describe('healthCheck', () => {
    it('should return isHealthy: true and latency when Redis responds with PONG', async () => {
      mockClient.ping.mockResolvedValue('PONG');

      const health = await service.healthCheck();
      expect(health.isHealthy).toBe(true);
      expect(typeof health.latencyMs).toBe('number');
      expect(health.error).toBeUndefined();
    });

    it('should return isHealthy: false when ping fails', async () => {
      mockClient.ping.mockRejectedValue(new Error('Connection refused'));

      const health = await service.healthCheck();
      expect(health.isHealthy).toBe(false);
      expect(health.error).toBe('Connection refused');
    });

    it('should report unhealthy when client is null', async () => {
      const nullService = new RedisService(null);
      const health = await nullService.healthCheck();
      expect(health.isHealthy).toBe(false);
      expect(health.error).toContain('not configured');
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit client on shutdown', async () => {
      await service.onModuleDestroy();
      expect(mockClient.quit).toHaveBeenCalled();
    });
  });
});
