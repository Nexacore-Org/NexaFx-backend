import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceFlagService } from './compliance-flag.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComplianceFlag } from './entities/compliance-flag.entity';
import { Sar } from './entities/sar.entity';
import { User } from '../../users/user.entity';

const mockFlagRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOneOrFail: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  find: jest.fn(),
};

const mockSarRepo = {
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
};

const mockUserRepo = {
  update: jest.fn(),
};

describe('ComplianceFlagService', () => {
  let service: ComplianceFlagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceFlagService,
        {
          provide: getRepositoryToken(ComplianceFlag),
          useValue: mockFlagRepo,
        },
        {
          provide: getRepositoryToken(Sar),
          useValue: mockSarRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<ComplianceFlagService>(ComplianceFlagService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFlag', () => {
    it('should create a new compliance flag', async () => {
      const transaction = { id: 'tx-id', userId: 'user-id' };
      const flag = { id: 'flag-id' };
      mockFlagRepo.create.mockReturnValue(flag);
      mockFlagRepo.save.mockResolvedValue(flag);
      mockFlagRepo.count.mockResolvedValue(1);
      mockSarRepo.count.mockResolvedValue(0);

      const result = await service.createFlag(transaction as any, 'test-rule');
      expect(result).toEqual(flag);
      expect(mockUserRepo.update).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update the status of a flag', async () => {
      const flag = { id: 'flag-id', userId: 'user-id', status: 'OPEN' };
      mockFlagRepo.findOneOrFail.mockResolvedValue(flag);
      mockFlagRepo.save.mockResolvedValue({ ...flag, status: 'UNDER_REVIEW' });
      mockFlagRepo.count.mockResolvedValue(1);
      mockSarRepo.count.mockResolvedValue(0);

      const result = await service.updateStatus(
        'flag-id',
        'UNDER_REVIEW' as any,
      );
      expect(result.status).toEqual('UNDER_REVIEW');
      expect(mockUserRepo.update).toHaveBeenCalled();
    });
  });

  describe('fileSar', () => {
    it('should file a SAR for a flag', async () => {
      const flag = { id: 'flag-id', userId: 'user-id', status: 'OPEN' };
      const sar = { id: 'sar-id' };
      mockFlagRepo.findOneOrFail.mockResolvedValue(flag);
      mockSarRepo.create.mockReturnValue(sar);
      mockSarRepo.save.mockResolvedValue(sar);
      mockFlagRepo.save.mockResolvedValue({ ...flag, status: 'SAR_FILED' });
      mockFlagRepo.count.mockResolvedValue(0);
      mockSarRepo.count.mockResolvedValue(1);

      const result = await service.fileSar(
        'flag-id',
        'user-id',
        'narrative',
        'ref',
      );
      expect(result).toEqual(sar);
      expect(mockUserRepo.update).toHaveBeenCalled();
    });
  });
});
