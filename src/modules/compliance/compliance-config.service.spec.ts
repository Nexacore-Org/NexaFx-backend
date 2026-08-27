import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceConfigService } from './compliance-config.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AmlConfig } from './entities/aml-config.entity';

const mockConfigRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('ComplianceConfigService', () => {
  let service: ComplianceConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceConfigService,
        {
          provide: getRepositoryToken(AmlConfig),
          useValue: mockConfigRepo,
        },
      ],
    }).compile();

    service = module.get<ComplianceConfigService>(ComplianceConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return the AML config', async () => {
      const config = { id: 'config-id' };
      mockConfigRepo.findOne.mockResolvedValue(config);
      const result = await service.getConfig();
      expect(result).toEqual(config);
    });

    it('should create a new config if one does not exist', async () => {
      const config = { id: 'config-id' };
      mockConfigRepo.findOne.mockResolvedValue(null);
      mockConfigRepo.create.mockReturnValue(config);
      mockConfigRepo.save.mockResolvedValue(config);
      const result = await service.getConfig();
      expect(result).toEqual(config);
    });
  });

  describe('updateConfig', () => {
    it('should update the AML config', async () => {
      const config = { id: 'config-id', largeTxThresholdUsd: 10000 };
      const dto = { largeTxThresholdUsd: 20000 };
      mockConfigRepo.findOne.mockResolvedValue(config);
      mockConfigRepo.save.mockResolvedValue({ ...config, ...dto });
      const result = await service.updateConfig(dto);
      expect(result.largeTxThresholdUsd).toEqual(20000);
    });
  });
});
