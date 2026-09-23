import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { TrainingService } from './training.service';
import { TrainingModule } from './entities/training-module.entity';
import {
  StaffTrainingRecord,
  TrainingStatus,
} from './entities/staff-training-record.entity';

describe('TrainingService', () => {
  let service: TrainingService;
  let moduleRepo: jest.Mocked<Repository<TrainingModule>>;
  let recordRepo: jest.Mocked<Repository<StaffTrainingRecord>>;

  const mockTrainingModule: TrainingModule = {
    id: 'mod-1',
    title: 'AML Compliance',
    description: 'Anti-money laundering training',
    durationMinutes: 60,
    isRequired: true,
    validityMonths: 12,
    targetRoles: ['USER', 'ADMIN'],
    createdAt: new Date('2026-01-01'),
  };

  const createRepoMock = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        {
          provide: getRepositoryToken(TrainingModule),
          useValue: createRepoMock(),
        },
        {
          provide: getRepositoryToken(StaffTrainingRecord),
          useValue: createRepoMock(),
        },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
    moduleRepo = module.get(getRepositoryToken(TrainingModule));
    recordRepo = module.get(getRepositoryToken(StaffTrainingRecord));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignModule', () => {
    it('creates training records for each user when module exists', async () => {
      moduleRepo.findOne.mockResolvedValue(mockTrainingModule);

      const records = [
        {
          userId: 'u1',
          moduleId: 'mod-1',
          status: TrainingStatus.ASSIGNED,
          assignedAt: expect.any(Date),
        },
        {
          userId: 'u2',
          moduleId: 'mod-1',
          status: TrainingStatus.ASSIGNED,
          assignedAt: expect.any(Date),
        },
      ];
      recordRepo.create.mockImplementation((data) => data as any);
      recordRepo.save.mockImplementation(async (data) => data as any);

      const result = await service.assignModule('mod-1', ['u1', 'u2']);

      expect(moduleRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'mod-1' },
      });
      expect(recordRepo.create).toHaveBeenCalledTimes(2);
      expect(recordRepo.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('throws NotFoundException when module does not exist', async () => {
      moduleRepo.findOne.mockResolvedValue(null);

      await expect(service.assignModule('nonexistent', ['u1'])).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('completeRecord', () => {
    it('marks record as completed with score and increments attempts', async () => {
      const record = {
        id: 'rec-1',
        userId: 'u1',
        moduleId: 'mod-1',
        status: TrainingStatus.ASSIGNED,
        score: null,
        attempts: 0,
        completedAt: null,
        expiresAt: null,
        module: mockTrainingModule,
      };
      recordRepo.findOne.mockResolvedValue(record as any);
      recordRepo.save.mockImplementation(async (data) => data as any);

      const result = await service.completeRecord('rec-1', 85);

      expect(record.status).toBe(TrainingStatus.COMPLETED);
      expect(record.completedAt).toBeInstanceOf(Date);
      expect(record.score).toBe(85);
      expect(record.attempts).toBe(1);
      expect(record.expiresAt).toBeInstanceOf(Date);
      expect(
        new Date(record.expiresAt as unknown as string).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it('sets score to null when no score provided', async () => {
      const record = {
        id: 'rec-1',
        status: TrainingStatus.ASSIGNED,
        score: null,
        attempts: 0,
        completedAt: null,
        expiresAt: null,
        module: mockTrainingModule,
      };
      recordRepo.findOne.mockResolvedValue(record as any);
      recordRepo.save.mockImplementation(async (data) => data as any);

      const result = await service.completeRecord('rec-1');

      expect(result.score).toBeNull();
      expect(result.attempts).toBe(1);
    });

    it('calculates expiry based on module validityMonths', async () => {
      const module = { ...mockTrainingModule, validityMonths: 6 };
      const record = {
        id: 'rec-1',
        status: TrainingStatus.ASSIGNED,
        score: null,
        attempts: 0,
        completedAt: null,
        expiresAt: null,
        module,
      };
      recordRepo.findOne.mockResolvedValue(record as any);
      recordRepo.save.mockImplementation(async (data) => data as any);

      const result = await service.completeRecord('rec-1', 90);

      const expectedExpiry = new Date();
      expectedExpiry.setMonth(expectedExpiry.getMonth() + 6);
      expect(result.expiresAt!.getMonth()).toBe(expectedExpiry.getMonth());
    });

    it('throws NotFoundException when record not found', async () => {
      recordRepo.findOne.mockResolvedValue(null);

      await expect(service.completeRecord('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not set expiresAt when module relation is missing', async () => {
      const record = {
        id: 'rec-1',
        status: TrainingStatus.ASSIGNED,
        score: null,
        attempts: 0,
        completedAt: null,
        expiresAt: null,
        module: null,
      };
      recordRepo.findOne.mockResolvedValue(record as any);
      recordRepo.save.mockImplementation(async (data) => data as any);

      const result = await service.completeRecord('rec-1', 70);

      expect(result.expiresAt).toBeNull();
    });
  });

  describe('getOverdueTrainings', () => {
    it('returns records with EXPIRED status', async () => {
      const expiredRecords = [
        {
          id: 'rec-1',
          status: TrainingStatus.EXPIRED,
          module: mockTrainingModule,
          assignedAt: new Date('2026-01-01'),
        },
      ];
      recordRepo.find.mockResolvedValue(expiredRecords as any);

      const result = await service.getOverdueTrainings();

      expect(recordRepo.find).toHaveBeenCalledWith({
        where: { status: TrainingStatus.EXPIRED },
        relations: ['module'],
        order: { assignedAt: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no overdue trainings exist', async () => {
      recordRepo.find.mockResolvedValue([]);

      const result = await service.getOverdueTrainings();

      expect(result).toHaveLength(0);
    });
  });

  describe('getTrainingStatus', () => {
    it('returns all records for a given user', async () => {
      const records = [
        {
          id: 'rec-1',
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          module: mockTrainingModule,
        },
        {
          id: 'rec-2',
          userId: 'u1',
          status: TrainingStatus.IN_PROGRESS,
          module: mockTrainingModule,
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.getTrainingStatus('u1');

      expect(recordRepo.find).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        relations: ['module'],
        order: { assignedAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });

    it('returns empty array for user with no records', async () => {
      recordRepo.find.mockResolvedValue([]);

      const result = await service.getTrainingStatus('no-user');

      expect(result).toHaveLength(0);
    });
  });

  describe('getComplianceReport', () => {
    it('groups records by user and counts total, overdue, completed', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24);

      const records = [
        {
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          expiresAt: pastDate, // expired -> overdue
          module: mockTrainingModule,
        },
        {
          userId: 'u1',
          status: TrainingStatus.EXPIRED,
          expiresAt: null,
          module: mockTrainingModule,
        },
        {
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365), // not expired -> completed
          module: mockTrainingModule,
        },
        {
          userId: 'u2',
          status: TrainingStatus.ASSIGNED,
          expiresAt: null,
          module: mockTrainingModule,
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.getComplianceReport();

      const u1Report = result.find((r) => r.userId === 'u1');
      expect(u1Report).toBeDefined();
      expect(u1Report!.total).toBe(3);
      expect(u1Report!.overdue).toBe(2);
      expect(u1Report!.completed).toBe(1);

      const u2Report = result.find((r) => r.userId === 'u2');
      expect(u2Report).toBeDefined();
      expect(u2Report!.total).toBe(1);
      expect(u2Report!.overdue).toBe(0);
      expect(u2Report!.completed).toBe(0);
    });

    it('returns empty array when no records exist', async () => {
      recordRepo.find.mockResolvedValue([]);

      const result = await service.getComplianceReport();

      expect(result).toEqual([]);
    });
  });

  describe('enforceAccess', () => {
    it('allows access when user has no overdue required trainings', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365);
      const records = [
        {
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          expiresAt: futureDate,
          module: { ...mockTrainingModule, isRequired: true },
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.enforceAccess('u1');

      expect(result.allowed).toBe(true);
      expect(result.overdueCount).toBe(0);
    });

    it('blocks access when user has overdue required trainings', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
      const records = [
        {
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          expiresAt: pastDate,
          module: { ...mockTrainingModule, isRequired: true },
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.enforceAccess('u1');

      expect(result.allowed).toBe(false);
      expect(result.overdueCount).toBe(1);
    });

    it('blocks access when user has EXPIRED required trainings', async () => {
      const records = [
        {
          userId: 'u1',
          status: TrainingStatus.EXPIRED,
          expiresAt: null,
          module: { ...mockTrainingModule, isRequired: true },
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.enforceAccess('u1');

      expect(result.allowed).toBe(false);
      expect(result.overdueCount).toBe(1);
    });

    it('allows access for overdue non-required trainings', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
      const records = [
        {
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          expiresAt: pastDate,
          module: { ...mockTrainingModule, isRequired: false },
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.enforceAccess('u1');

      expect(result.allowed).toBe(true);
      expect(result.overdueCount).toBe(0);
    });

    it('allows access when user has no records', async () => {
      recordRepo.find.mockResolvedValue([]);

      const result = await service.enforceAccess('u1');

      expect(result.allowed).toBe(true);
      expect(result.overdueCount).toBe(0);
    });

    it('counts multiple overdue trainings', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
      const records = [
        {
          userId: 'u1',
          status: TrainingStatus.COMPLETED,
          expiresAt: pastDate,
          module: { ...mockTrainingModule, isRequired: true },
        },
        {
          userId: 'u1',
          status: TrainingStatus.EXPIRED,
          expiresAt: null,
          module: { ...mockTrainingModule, isRequired: true },
        },
      ];
      recordRepo.find.mockResolvedValue(records as any);

      const result = await service.enforceAccess('u1');

      expect(result.allowed).toBe(false);
      expect(result.overdueCount).toBe(2);
    });
  });
});
