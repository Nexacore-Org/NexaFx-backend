import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from './config.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlatformConfig } from './entities/platform-config.entity';
import { ConfigVersion } from './entities/config-version.entity';
import { getRedisToken } from '@nestjs-modules/ioredis';

const mockConfigRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
};

const mockVersionRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: getRepositoryToken(PlatformConfig),
          useValue: mockConfigRepo,
        },
        {
          provide: getRepositoryToken(ConfigVersion),
          useValue: mockVersionRepo,
        },
        {
          provide: getRedisToken('default'),
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return a config from the database', async () => {
      const config = { key: 'test', value: { type: 'string', data: 'value' } };
      mockRedis.get.mockResolvedValue(null);
      mockConfigRepo.findOne.mockResolvedValue(config);
      const result = await service.getConfig('test');
      expect(result).toEqual(config);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should return a config from the cache', async () => {
      const config = { key: 'test', value: { type: 'string', data: 'value' } };
      mockRedis.get.mockResolvedValue(JSON.stringify(config));
      const result = await service.getConfig('test');
      expect(result).toEqual(config);
      expect(mockConfigRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('setConfig', () => {
    it('should set a new config value and create a version', async () => {
      const config = {
        key: 'test',
        value: { type: 'string', data: 'old' },
        isEditable: true,
      };
      const newValue = { type: 'string', data: 'new' };
      mockConfigRepo.findOne.mockResolvedValue(config);
      mockVersionRepo.create.mockReturnValue({} as any);
      mockVersionRepo.save.mockResolvedValue({} as any);
      mockConfigRepo.save.mockResolvedValue({ ...config, value: newValue });

      const result = await service.setConfig('test', newValue, 'admin-id');
      expect(result.value).toEqual(newValue);
      expect(mockVersionRepo.save).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should throw an error if the config is not editable', async () => {
      const config = { key: 'test', isEditable: false };
      mockConfigRepo.findOne.mockResolvedValue(config);
      await expect(
        service.setConfig('test', {} as any, 'admin-id'),
      ).rejects.toThrow("Config key 'test' is not editable");
    });
  });

  describe('rollbackConfig', () => {
    it('should rollback a config to a previous version', async () => {
      const version = {
        id: 'version-id',
        configKey: 'test',
        oldValue: { type: 'string', data: 'old' },
      };
      const config = {
        key: 'test',
        value: { type: 'string', data: 'current' },
      };
      mockVersionRepo.findOne.mockResolvedValue(version);
      mockConfigRepo.findOne.mockResolvedValue(config);
      mockVersionRepo.create.mockReturnValue({} as any);
      mockVersionRepo.save.mockResolvedValue({} as any);
      mockConfigRepo.save.mockResolvedValue({
        ...config,
        value: version.oldValue,
      });

      const result = await service.rollbackConfig('version-id', 'admin-id');
      expect(result.value).toEqual(version.oldValue);
      expect(mockVersionRepo.save).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});
