import { Test, TestingModule } from '@nestjs/testing';
import { IpBlocklistService } from './ip-blocklist.service';
import { RedisService } from '../redis/redis.service';

describe('IpBlocklistService', () => {
  let service: IpBlocklistService;
  let redis: {
    key: jest.Mock;
    exists: jest.Mock;
    setString: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    redis = {
      key: jest.fn((ns: string, ip: string) => `${ns}:${ip}`),
      exists: jest.fn(),
      setString: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpBlocklistService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(IpBlocklistService);
  });

  it('isBlocked returns true when Redis reports key exists', async () => {
    redis.exists.mockResolvedValue(true);
    await expect(service.isBlocked('1.2.3.4')).resolves.toBe(true);
    expect(redis.key).toHaveBeenCalledWith('ip-blocklist', '1.2.3.4');
  });

  it('isBlocked returns false for a clean IP', async () => {
    redis.exists.mockResolvedValue(false);
    await expect(service.isBlocked('8.8.8.8')).resolves.toBe(false);
  });

  it('fails open (returns false) when Redis is unavailable', async () => {
    redis.exists.mockResolvedValue(null);
    await expect(service.isBlocked('9.9.9.9')).resolves.toBe(false);
  });

  it('blockIp writes Redis key with TTL so next check sees the block', async () => {
    await service.blockIp('10.0.0.1', 120);
    expect(redis.setString).toHaveBeenCalledWith('ip-blocklist:10.0.0.1', '1', 120);

    redis.exists.mockResolvedValue(true);
    await expect(service.isBlocked('10.0.0.1')).resolves.toBe(true);
  });

  it('unblockIp deletes key so subsequent requests are allowed', async () => {
    await service.unblockIp('10.0.0.1');
    expect(redis.delete).toHaveBeenCalledWith('ip-blocklist:10.0.0.1');

    redis.exists.mockResolvedValue(false);
    await expect(service.isBlocked('10.0.0.1')).resolves.toBe(false);
  });
});
