import { FlagsService } from './flags.service';
import { FeatureFlag } from './entities/feature-flag.entity';

describe('FlagsService', () => {
  let service: FlagsService;
  let repoMock: any;
  let cacheMock: any;
  let configMock: any;

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
    service = new FlagsService(repoMock, cacheMock, configMock);
  });

  const baseFlag = {
    id: '1',
    key: 'test_flag',
    isEnabled: true,
    name: 'Test flag',
    description: '',
    environments: ['production'],
    rolloutPercent: 0,
    targetUserIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as FeatureFlag;

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
    configMock.get.mockReturnValue(undefined); // Default to development
    cacheMock.get.mockResolvedValue({
      ...baseFlag,
      environments: ['development'],
      rolloutPercent: 100,
    });
    expect(await service.isEnabled('test_flag')).toBe(true);
  });

  it('should list flags', async () => {
    repoMock.find.mockResolvedValue([baseFlag]);
    expect(await service.listFlags()).toEqual([baseFlag]);
  });

  it('should create flag', async () => {
    repoMock.create.mockReturnValue(baseFlag);
    repoMock.save.mockResolvedValue(baseFlag);
    expect(await service.createFlag({})).toEqual(baseFlag);
  });

  it('should update flag and delete cache', async () => {
    repoMock.findOneOrFail.mockResolvedValue(baseFlag);
    repoMock.save.mockResolvedValue({ ...baseFlag, name: 'new' });
    await service.updateFlag('1', { name: 'new' });
    expect(cacheMock.del).toHaveBeenCalledWith('flag_test_flag');
  });

  it('should delete flag and delete cache', async () => {
    const flagToDel = { ...baseFlag };
    repoMock.findOneOrFail.mockResolvedValue(flagToDel);
    repoMock.save.mockResolvedValue(flagToDel);
    await service.deleteFlag('1');
    expect(flagToDel.isEnabled).toBe(false);
    expect(flagToDel.key).toMatch(/^archived_/);
    expect(cacheMock.del).toHaveBeenCalledWith('flag_test_flag');
  });

  it('should get flags for user', async () => {
    repoMock.find.mockResolvedValue([{ ...baseFlag, rolloutPercent: 100 }]);
    cacheMock.get.mockResolvedValue({ ...baseFlag, rolloutPercent: 100 });
    const res = await service.getFlagsForUser('user1');
    expect(res).toEqual({ test_flag: true });
  });
});
