import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceController } from './compliance.controller';
import { AmlService } from './aml.service';
import { ComplianceFlagService } from './compliance-flag.service';
import { SarService } from './sar.service';
import { ComplianceConfigService } from './compliance-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

const mockAmlService = {};
const mockFlagService = {
  findFlags: jest.fn(),
  updateStatus: jest.fn(),
  fileSar: jest.fn(),
  getDashboard: jest.fn(),
  exportCsv: jest.fn(),
};
const mockSarService = {};
const mockConfigService = {
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
};

describe('ComplianceController', () => {
  let controller: ComplianceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        { provide: AmlService, useValue: mockAmlService },
        { provide: ComplianceFlagService, useValue: mockFlagService },
        { provide: SarService, useValue: mockSarService },
        { provide: ComplianceConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ComplianceController>(ComplianceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listFlags', () => {
    it('should call flagService.findFlags', async () => {
      const query = {};
      await controller.listFlags(query as any);
      expect(mockFlagService.findFlags).toHaveBeenCalledWith(query);
    });
  });

  describe('updateFlagStatus', () => {
    it('should call flagService.updateStatus', async () => {
      const dto = { status: 'UNDER_REVIEW' } as any;
      const admin = { userId: 'admin-id' };
      await controller.updateFlagStatus('flag-id', dto, admin);
      expect(mockFlagService.updateStatus).toHaveBeenCalledWith(
        'flag-id',
        'UNDER_REVIEW',
        'admin-id',
      );
    });
  });

  describe('fileSar', () => {
    it('should call flagService.fileSar', async () => {
      const dto = { narrative: 'narrative', reportReference: 'ref' };
      const admin = { userId: 'admin-id' };
      await controller.fileSar('flag-id', dto, admin);
      expect(mockFlagService.fileSar).toHaveBeenCalledWith(
        'flag-id',
        'admin-id',
        'narrative',
        'ref',
      );
    });
  });

  describe('dashboard', () => {
    it('should call flagService.getDashboard', async () => {
      await controller.dashboard();
      expect(mockFlagService.getDashboard).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('should call configService.getConfig', async () => {
      await controller.getConfig();
      expect(mockConfigService.getConfig).toHaveBeenCalled();
    });
  });

  describe('updateConfig', () => {
    it('should call configService.updateConfig', async () => {
      const dto = {};
      await controller.updateConfig(dto as any);
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(dto);
    });
  });
});
