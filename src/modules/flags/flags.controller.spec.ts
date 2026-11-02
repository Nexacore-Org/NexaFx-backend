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

jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: { create: jest.fn() },
}));

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      canActivate() {
        return true;
      }
    },
}));

import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FlagsController } from './flags.controller';
import { CreateFeatureFlagDto } from './dto';

describe('FlagsController (#1507)', () => {
  let controller: FlagsController;
  let service: any;

  beforeEach(() => {
    service = {
      getFlagsForUser: jest.fn(),
      listFlags: jest.fn(),
      createFlag: jest.fn(),
      updateFlag: jest.fn(),
      deleteFlag: jest.fn(),
      isEnabled: jest.fn(),
      checkFlagForUser: jest.fn(),
      findById: jest.fn(),
    };
    controller = new FlagsController(service);
  });

  it('should call getFlagsForUser', async () => {
    service.getFlagsForUser.mockResolvedValue({ flag1: true });
    expect(await controller.getUserFlags({ user: { userId: '1' } })).toEqual({
      flag1: true,
    });
  });

  it('should call listFlags', async () => {
    service.listFlags.mockResolvedValue([]);
    expect(await controller.listFlags()).toEqual([]);
  });

  it('should call createFlag and reject rolloutPercent 250 with 400', async () => {
    service.createFlag.mockResolvedValue({ key: 'flag1' });
    expect(
      await controller.createFlag({
        key: 'flag1',
        name: 'Flag 1',
        rolloutPercent: 50,
      }),
    ).toEqual({ key: 'flag1' });

    await expect(
      controller.createFlag({
        key: 'flag1',
        name: 'Flag 1',
        rolloutPercent: 250,
      }),
    ).rejects.toThrow(BadRequestException);

    const dto = plainToInstance(CreateFeatureFlagDto, {
      key: 'flag1',
      name: 'Flag 1',
      rolloutPercent: 250,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should call updateFlag and reject invalid rolloutPercent with 400', async () => {
    service.updateFlag.mockResolvedValue({});
    expect(
      await controller.updateFlag('00000000-0000-4000-8000-000000000001', {
        rolloutPercent: 80,
      }),
    ).toEqual({});

    await expect(
      controller.updateFlag('00000000-0000-4000-8000-000000000001', {
        rolloutPercent: -5,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should call deleteFlag', async () => {
    service.deleteFlag.mockResolvedValue(undefined);
    expect(
      await controller.deleteFlag('00000000-0000-4000-8000-000000000001'),
    ).toEqual({ success: true });
  });

  it('should delegate checkFlagForUser to service.checkFlagForUser by id instead of loading all flags', async () => {
    service.checkFlagForUser.mockResolvedValue({ enabled: true });
    expect(
      await controller.checkFlagForUser(
        '00000000-0000-4000-8000-000000000001',
        'user1',
      ),
    ).toEqual({
      enabled: true,
    });
    expect(service.checkFlagForUser).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      'user1',
    );
    expect(service.listFlags).not.toHaveBeenCalled();
  });

  it('should return enabled false if flag not found in checkFlagForUser', async () => {
    service.checkFlagForUser.mockResolvedValue({ enabled: false });
    expect(
      await controller.checkFlagForUser(
        '00000000-0000-4000-8000-000000000001',
        'user1',
      ),
    ).toEqual({
      enabled: false,
    });
  });
});
