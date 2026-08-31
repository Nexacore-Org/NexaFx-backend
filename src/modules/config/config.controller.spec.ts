import { Test, TestingModule } from '@nestjs/testing';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockConfigService = {
  getAllConfigs: jest.fn(),
  getConfig: jest.fn(),
  setConfig: jest.fn(),
  getConfigHistory: jest.fn(),
  rollbackConfig: jest.fn(),
};

describe('ConfigController', () => {
  let controller: ConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [{ provide: ConfigService, useValue: mockConfigService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConfigController>(ConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllConfigs', () => {
    it('should call configService.getAllConfigs', async () => {
      await controller.getAllConfigs();
      expect(mockConfigService.getAllConfigs).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('should call configService.getConfig', async () => {
      await controller.getConfig('test');
      expect(mockConfigService.getConfig).toHaveBeenCalledWith('test');
    });
  });

  describe('updateConfig', () => {
    it('should call configService.setConfig', async () => {
      const body = { value: { type: 'string', data: 'new' }, reason: 'test' };
      await controller.updateConfig('test', body, 'admin-id');
      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'test',
        body.value,
        'admin-id',
        'test',
      );
    });
  });

  describe('getConfigHistory', () => {
    it('should call configService.getConfigHistory', async () => {
      await controller.getConfigHistory('test');
      expect(mockConfigService.getConfigHistory).toHaveBeenCalledWith('test');
    });
  });

  describe('rollbackConfig', () => {
    it('should call configService.rollbackConfig', async () => {
      const body = { versionId: 'version-id' };
      await controller.rollbackConfig('test', body, 'admin-id');
      expect(mockConfigService.rollbackConfig).toHaveBeenCalledWith(
        'version-id',
        'admin-id',
      );
    });
  });
});
