// src/data-residency/data-residency.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DataResidencyService } from './data-residency.service';
import { DataResidencyPolicy, DataRegion } from './entities/data-residency-policy.entity';

describe('DataResidencyService', () => {
  let service: DataResidencyService;
  let repo: Repository<DataResidencyPolicy>;
  let configService: ConfigService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((policy) => Promise.resolve({ id: 'uuid-123', ...policy })),
    find: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('US'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataResidencyService,
        { provide: getRepositoryToken(DataResidencyPolicy), useValue: mockRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DataResidencyService>(DataResidencyService);
    repo = module.get<Repository<DataResidencyPolicy>>(getRepositoryToken(DataResidencyPolicy));
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setPolicy', () => {
    it('should create a new residency policy if none exists', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.setPolicy(
        { userId: 'user-1', requiredRegion: DataRegion.EU },
        'admin-1',
      );

      expect(result).toMatchObject({
        userId: 'user-1',
        requiredRegion: DataRegion.EU,
        setByAdminId: 'admin-1',
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should update an existing residency policy', async () => {
      const existing = { userId: 'user-1', requiredRegion: DataRegion.US, setByAdminId: 'admin-1' };
      mockRepository.findOne.mockResolvedValueOnce(existing);

      const result = await service.setPolicy(
        { userId: 'user-1', requiredRegion: DataRegion.EU },
        'admin-2',
      );

      expect(result.requiredRegion).toEqual(DataRegion.EU);
      expect(result.setByAdminId).toEqual('admin-2');
    });
  });

  describe('getAuditConflicts', () => {
    it('should identify users whose required region conflicts with system storage config', async () => {
      const policies = [
        { userId: 'user-1', requiredRegion: DataRegion.EU },     // Conflict (system is US)
        { userId: 'user-2', requiredRegion: DataRegion.US },     // No conflict
        { userId: 'user-3', requiredRegion: DataRegion.UNRESTRICTED }, // No conflict
      ];
      mockRepository.find.mockResolvedValueOnce(policies);

      const audit = await service.getAuditConflicts();

      expect(audit.currentSystemRegion).toEqual('US');
      expect(audit.conflicts).toHaveLength(1);
      expect(audit.conflicts[0].userId).toEqual('user-1');
    });
  });
});