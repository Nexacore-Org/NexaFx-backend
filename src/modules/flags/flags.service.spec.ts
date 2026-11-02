jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    TypeOrmModule: {
      forFeature: jest.fn(),
      forRoot: jest.fn(),
    },
  };
});

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
  CacheModule: { register: jest.fn() },
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FlagsService } from './flags.service';
import { FeatureFlag } from './entities/feature-flag.entity';

describe('FlagsService (#1507)', () => {
  let service: FlagsService;
  let repoMock: any;
  let cacheMock: any;
  let configMock: any;
  let auditMock: any;

  beforeEach(() => {
    repoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findOneOrFail: jest.fn(),
    };
    cacheMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    configMock = {
      get: jest.fn().mockReturnValue('production'),
    };
    auditMock = {
      createLog: jest.fn().mockResolvedValue(undefined),
    };
    service = new FlagsService(repoMock, cacheMock, configMock, auditMock);
  });

  const baseFlag: FeatureFlag = {
    id: '00000000-0000-4000-8000-000000000001',
    key: 'test_flag',
    isEnabled: true,
    name: 'Test flag',
    description: '',
    environments: ['production'],
    rolloutPercent: 0,
    targetUserIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should return true if rollout is 100%', async () => {
    cacheMock.get.mockResolvedValue({ ...baseFlag, rolloutPercent: 100 });
    expect(await service.isEnabled('test_flag')).toBe(true);
  });

  it('should return false if rollout is 0%', async () => {
    cacheMock.get.mockResolvedValue({ ...baseFlag, rolloutPercent: 0 });
    expect(await service.isEnabled('test_flag', 'user1')).toBe(false);
  });

  it('should return true for targeted users even if 0% rollout', async () => {
    cacheMock.get.mockResolvedValue({
      ...baseFlag,
      rolloutPercent: 0,
      targetUserIds: ['user1'],
    });
    expect(await service.isEnabled('test_flag', 'user1')).toBe(true);
  });

  it('should be consistent based on deterministic hash for 50% rollout', async () => {
    cacheMock.get.mockResolvedValue({ ...baseFlag, rolloutPercent: 50 });

    const result1 = await service.isEnabled('test_flag', 'user1');
    const result2 = await service.isEnabled('test_flag', 'user1');
    expect(result1).toBe(result2);
  });

  it('should return false if disabled', async () => {
    cacheMock.get.mockResolvedValue({
      ...baseFlag,
      isEnabled: false,
      rolloutPercent: 100,
    });
    expect(await service.isEnabled('test_flag', 'user1')).toBe(false);
  });

  it('should return false if environment does not match', async () => {
    cacheMock.get.mockResolvedValue({
      ...baseFlag,
      environments: ['staging'],
      rolloutPercent: 100,
    });
    expect(await service.isEnabled('test_flag', 'user1')).toBe(false);
  });

  it('should return false for missing user if partial rollout', async () => {
    cacheMock.get.mockResolvedValue({ ...baseFlag, rolloutPercent: 50 });
    expect(await service.isEnabled('test_flag')).toBe(false);
  });

  it('should cache DB result if not found in cache', async () => {
    cacheMock.get.mockResolvedValue(null);
    repoMock.findOne.mockResolvedValue(baseFlag);

    await service.isEnabled('test_flag');
    expect(repoMock.findOne).toHaveBeenCalledWith({
      where: { key: 'test_flag' },
    });
    expect(cacheMock.set).toHaveBeenCalledWith(
      'flag_test_flag',
      baseFlag,
      60000,
    );
  });

  it('should return false if DB flag not found', async () => {
    cacheMock.get.mockResolvedValue(null);
    repoMock.findOne.mockResolvedValue(null);
    expect(await service.isEnabled('test_flag')).toBe(false);
  });

  it('should return false if environments array is null', async () => {
    cacheMock.get.mockResolvedValue({
      ...baseFlag,
      environments: null,
      rolloutPercent: 100,
    });
    expect(await service.isEnabled('test_flag', 'user1')).toBe(false);
  });

  it('should return true if environment defaults to development and matches', async () => {
    configMock.get.mockReturnValue(undefined);
    cacheMock.get.mockResolvedValue({
      ...baseFlag,
      environments: ['development'],
      rolloutPercent: 100,
    });
    expect(await service.isEnabled('test_flag')).toBe(true);
  });

  it('should list flags excluding archived_* flags', async () => {
    repoMock.find.mockResolvedValue([
      baseFlag,
      { ...baseFlag, id: '2', key: 'archived_1700000000_old_flag' },
    ]);
    expect(await service.listFlags()).toEqual([baseFlag]);
  });

  it('should create flag, strip immutable fields, and record an audit log', async () => {
    repoMock.create.mockReturnValue(baseFlag);
    repoMock.save.mockResolvedValue(baseFlag);
    const created = await service.createFlag(
      {
        id: 'spoofed-id',
        key: 'test_flag',
        name: 'Test flag',
        rolloutPercent: 50,
      } as any,
      'admin-1',
    );
    expect(repoMock.create).toHaveBeenCalledWith({
      key: 'test_flag',
      name: 'Test flag',
      rolloutPercent: 50,
    });
    expect(created).toEqual(baseFlag);
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FEATURE_FLAG_CREATED',
        actorId: 'admin-1',
      }),
    );
  });

  it('rejects invalid rolloutPercent (250 or -5), null environments, or archived_ keys with 400 BadRequestException', async () => {
    await expect(
      service.createFlag({
        key: 'valid_key',
        name: 'Valid',
        rolloutPercent: 250,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createFlag({
        key: 'valid_key',
        name: 'Valid',
        rolloutPercent: -5,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createFlag({
        key: 'archived_secret',
        name: 'Archived prefix not allowed',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.updateFlag(baseFlag.id, { environments: null as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 404 NotFoundException when updating or deleting an unknown UUID', async () => {
    repoMock.findOne.mockResolvedValue(null);

    await expect(
      service.updateFlag('00000000-0000-4000-8000-999999999999', {
        name: 'nope',
      }),
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.deleteFlag('00000000-0000-4000-8000-999999999999'),
    ).rejects.toThrow(NotFoundException);
  });

  it('invalidates both old and new key cache entries when renaming a flag key', async () => {
    repoMock.findOne.mockResolvedValue({ ...baseFlag, key: 'old_key' });
    repoMock.save.mockImplementation(async (f: FeatureFlag) => f);

    const updated = await service.updateFlag(
      baseFlag.id,
      { key: 'new_key', name: 'Renamed' },
      'admin-1',
    );

    expect(updated.key).toBe('new_key');
    expect(cacheMock.del).toHaveBeenCalledWith('flag_old_key');
    expect(cacheMock.del).toHaveBeenCalledWith('flag_new_key');
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FEATURE_FLAG_UPDATED',
        actorId: 'admin-1',
      }),
    );
  });

  it('should delete flag, archive key, invalidate original cache, and write audit log', async () => {
    const flagToDel = { ...baseFlag };
    repoMock.findOne.mockResolvedValue(flagToDel);
    repoMock.save.mockResolvedValue(flagToDel);

    await service.deleteFlag(baseFlag.id, 'admin-1');

    expect(flagToDel.isEnabled).toBe(false);
    expect(flagToDel.key).toMatch(/^archived_/);
    expect(cacheMock.del).toHaveBeenCalledWith('flag_test_flag');
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FEATURE_FLAG_DELETED',
        actorId: 'admin-1',
      }),
    );
  });

  it('evaluates getFlagsForUser from loaded entities without N+1 cache hits and never returns archived_ or disabled flags', async () => {
    repoMock.find.mockResolvedValue([
      {
        ...baseFlag,
        key: 'enabled_flag',
        isEnabled: true,
        rolloutPercent: 100,
      },
      {
        ...baseFlag,
        key: 'archived_1700000_secret_flag',
        isEnabled: true,
        rolloutPercent: 100,
      },
      {
        ...baseFlag,
        key: 'disabled_unreleased_flag',
        isEnabled: false,
        rolloutPercent: 100,
      },
    ]);

    const res = await service.getFlagsForUser('user1');

    expect(res).toEqual({ enabled_flag: true });
    expect(res).not.toHaveProperty('archived_1700000_secret_flag');
    expect(res).not.toHaveProperty('disabled_unreleased_flag');
    expect(cacheMock.get).not.toHaveBeenCalled();
  });
});
