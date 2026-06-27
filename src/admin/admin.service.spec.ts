import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminService } from './admin.service';
import { User, UserRole } from '../users/user.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DataRequest } from '../users/entities/data-request.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { RateAlert } from '../rate-alerts/entities/rate-alert.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserQueryDto } from './dto/user-query.dto';
import { OverrideTransactionDto } from './dto/override-transaction.dto';
import { TransactionLimitService } from '../transactions/services/transaction-limit.service';
import { MigrationSnapshot, SnapshotStatus } from '../database/entities/migration-snapshot.entity';
import { DataSource } from 'typeorm';
import { BackupManifestService } from './services/backup-manifest.service';

describe('AdminService', () => {
  let service: AdminService;
  let userRepository: Repository<User>;
  let transactionRepository: Repository<Transaction>;
  let auditLogsService: AuditLogsService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    role: UserRole.USER,
    isSuspended: false,
    isVerified: true,
    createdAt: new Date(),
  } as User;

  const mockTransaction: Transaction = {
    id: 'tx-123',
    type: TransactionType.DEPOSIT,
    amount: '100.00',
    currency: 'USD',
    status: TransactionStatus.SUCCESS,
    createdAt: new Date(),
    userId: 'user-123',
    txHash: null,
    failureReason: null,
    feeAmount: null,
    feeCurrency: null,
    toCurrency: null,
    toAmount: null,
    metadata: null,
    processingLockedAt: null,
    processingLockedBy: null,
  } as Transaction;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              addGroupBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              addGroupBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(DataRequest),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
            })),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logAuthEvent: jest.fn(),
            logTransactionEvent: jest.fn(),
            getPrivilegedLogs: jest.fn(),
          },
        },
        {
          provide: TransactionLimitService,
          useValue: {
            listLimits: jest.fn(),
            upsertLimit: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(KycRecord),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RateAlert),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              orderBy: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              stream: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(MigrationSnapshot),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: BackupManifestService,
          useValue: {
            listRecentManifests: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  describe('unsuspendUser', () => {
    it('should unsuspend user', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser, isSuspended: true });
      jest
        .spyOn(userRepository, 'save')
        .mockImplementation(async (u) => u as User);

      await service.unsuspendUser('user-123', 'admin-123');

      expect(auditLogsService.logAuthEvent).toHaveBeenCalledWith(
        'admin-123',
        expect.stringContaining('UNSUSPEND'),
        expect.anything(),
        true,
      );
    });

    it('should throw BadRequestException if not suspended', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser, isSuspended: false });

      await expect(
        service.unsuspendUser('user-123', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const query = { page: 1, limit: 10 };
      const transactions = [mockTransaction];
      const total = 1;

      const queryBuilder: any = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([transactions, total]),
      };

      jest
        .spyOn(transactionRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder);

      const result = await service.getTransactions(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlatformMetrics', () => {
    it('should return platform metrics', async () => {
      jest.spyOn(userRepository, 'count').mockResolvedValue(10);
      jest.spyOn(transactionRepository, 'count').mockResolvedValue(20);

      const result = await service.getPlatformMetrics();

      expect(result).toBeDefined();
      expect(result.users.total).toBe(10);
      expect(result.transactions.totalCount).toBe(20);
      expect(result.dailySignups).toBeDefined();
      expect(result.dailyTransactionVolumes).toBeDefined();
    });

    it('should return time-series data with correct structure', async () => {
      const mockSignups = [{ date: '2023-01-01', count: 5 }];
      const mockVolumes = [
        { date: '2023-01-01', depositVolume: 100, withdrawalVolume: 50 },
      ];

      jest.spyOn(userRepository, 'count').mockResolvedValue(10);
      jest.spyOn(transactionRepository, 'count').mockResolvedValue(20);
      jest
        .spyOn(service as any, 'getDailySignups')
        .mockResolvedValue(mockSignups);
      jest
        .spyOn(service as any, 'getDailyTransactionVolumes')
        .mockResolvedValue(mockVolumes);

      const result = await service.getPlatformMetrics();

      expect(result.dailySignups).toEqual(mockSignups);
      expect(result.dailyTransactionVolumes).toEqual(mockVolumes);
    });
  });

  describe('getUsers', () => {
    it('should return paginated users', async () => {
      const query: UserQueryDto = { page: 1, limit: 10 };
      const users = [mockUser];
      const total = 1;

      const queryBuilder: any = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([users, total]),
      };

      jest
        .spyOn(userRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder);

      const result = await service.getUsers(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getUserById', () => {
    it('should return user details', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.getUserById('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getUserById('user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUserRole', () => {
    it('should return user unchanged when role is already set', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser });

      const result = await service.updateUserRole(
        'user-123',
        { role: UserRole.USER },
        'admin-123',
      );

      expect(result.role).toBe(UserRole.USER);
      expect(auditLogsService.logAuthEvent).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateUserRole(
          'user-123',
          { role: UserRole.ADMIN },
          'admin-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject admin-tier role assignment changes', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser });

      await expect(
        service.updateUserRole(
          'user-123',
          { role: UserRole.ADMIN },
          'admin-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('suspendUser', () => {
    it('should suspend user', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser, isSuspended: false });
      jest
        .spyOn(userRepository, 'save')
        .mockImplementation(async (u) => u as User);

      await service.suspendUser('user-123', 'admin-123');

      expect(auditLogsService.logAuthEvent).toHaveBeenCalledWith(
        'admin-123',
        expect.stringContaining('SUSPEND'),
        expect.anything(),
        true,
      );
    });

    it('should throw BadRequestException if already suspended', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser, isSuspended: true });

      await expect(
        service.suspendUser('user-123', 'admin-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('overrideTransactionStatus', () => {
    const mockTransaction: Transaction = {
      id: 'tx-override-test',
      userId: 'user-123',
      type: TransactionType.DEPOSIT,
      amount: '100.00',
      currency: 'USD',
      status: TransactionStatus.PENDING,
      toCurrency: null,
      toAmount: null,
      metadata: null,
      processingLockedAt: null,
      processingLockedBy: null,
    } as Transaction;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should override transaction status to SUCCESS with reason', async () => {
      const overrideDto: OverrideTransactionDto = {
        status: TransactionStatus.SUCCESS,
        reason: 'Manual verification completed',
      };

      jest
        .spyOn(transactionRepository, 'findOne')
        .mockResolvedValue(mockTransaction);
      jest.spyOn(transactionRepository, 'save').mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.SUCCESS,
        failureReason: 'Manual verification completed',
      });

      const result = await service.overrideTransactionStatus(
        'tx-override-test',
        overrideDto,
        'admin-123',
      );

      expect(result.status).toBe(TransactionStatus.SUCCESS);
      expect(result.failureReason).toBe('Manual verification completed');
      expect(auditLogsService.logTransactionEvent).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
        'tx-override-test',
        expect.objectContaining({
          oldStatus: TransactionStatus.PENDING,
          newStatus: TransactionStatus.SUCCESS,
          updatedBy: 'admin-123',
          reason: 'Manual verification completed',
          adminOverride: true,
        }),
      );
    });

    it('should override transaction status to FAILED with reason', async () => {
      const overrideDto: OverrideTransactionDto = {
        status: TransactionStatus.FAILED,
        reason: 'Blockchain confirmation timeout',
      };

      jest
        .spyOn(transactionRepository, 'findOne')
        .mockResolvedValue(mockTransaction);
      jest.spyOn(transactionRepository, 'save').mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.FAILED,
        failureReason: 'Blockchain confirmation timeout',
      });

      const result = await service.overrideTransactionStatus(
        'tx-override-test',
        overrideDto,
        'admin-123',
      );

      expect(result.status).toBe(TransactionStatus.FAILED);
    });

    it('should override transaction status to CANCELLED with reason', async () => {
      const overrideDto: OverrideTransactionDto = {
        status: TransactionStatus.CANCELLED,
        reason: 'User request after support ticket',
      };

      jest
        .spyOn(transactionRepository, 'findOne')
        .mockResolvedValue(mockTransaction);
      jest.spyOn(transactionRepository, 'save').mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.CANCELLED,
        failureReason: 'User request after support ticket',
      });

      const result = await service.overrideTransactionStatus(
        'tx-override-test',
        overrideDto,
        'admin-123',
      );

      expect(result.status).toBe(TransactionStatus.CANCELLED);
    });

    it('should throw BadRequestException when trying to override to PENDING', async () => {
      const overrideDto: OverrideTransactionDto = {
        status: TransactionStatus.PENDING,
        reason: 'Reset to pending',
      };

      await expect(
        service.overrideTransactionStatus(
          'tx-override-test',
          overrideDto,
          'admin-123',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.overrideTransactionStatus(
          'tx-override-test',
          overrideDto,
          'admin-123',
        ),
      ).rejects.toThrow(
        'Admin override cannot set status to PENDING. Only SUCCESS, FAILED, or CANCELLED are allowed.',
      );

      expect(transactionRepository.findOne).not.toHaveBeenCalled();
      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      const overrideDto: OverrideTransactionDto = {
        status: TransactionStatus.SUCCESS,
        reason: 'Manual override',
      };

      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.overrideTransactionStatus(
          'tx-nonexistent',
          overrideDto,
          'admin-123',
        ),
      ).rejects.toThrow(NotFoundException);

    });
  });

  describe('getStats', () => {
    it('should calculate stats correctly', async () => {
      jest.spyOn(service['userRepository'], 'count').mockResolvedValue(100);
      jest.spyOn(service['transactionRepository'], 'count').mockResolvedValue(500);
      jest.spyOn(service['kycRepository'], 'count').mockResolvedValue(5);
      jest.spyOn(service['rateAlertRepository'], 'count').mockResolvedValue(20);

      jest.spyOn(service['transactionRepository'], 'createQueryBuilder').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { currency: 'NGN', volume: '500000.00' },
          { currency: 'USD', volume: '1000.00' },
        ]),
      } as any);

      const stats = await service.getStats();

      expect(stats.totalUsers).toBe(100);
      expect(stats.totalTransactions).toBe(500);
      expect(stats.kycPendingCount).toBe(5);
      expect(stats.activeRateAlertsCount).toBe(20);
      expect(stats.transactionVolume30Days).toEqual({
        NGN: 500000.0,
        USD: 1000.0,
      });
      expect(stats.systemUptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAdminAuditLogs', () => {
    it('should call auditLogsService.getPrivilegedLogs', async () => {
      const mockResult = { logs: [], pagination: { total: 0 } };
      jest.spyOn(auditLogsService, 'getPrivilegedLogs').mockResolvedValue(mockResult as any);

      const filters = { actorId: 'user-1', action: 'login', page: 1, limit: 10 };
      const result = await service.getAdminAuditLogs(filters);

      expect(result).toBe(mockResult);
      expect(auditLogsService.getPrivilegedLogs).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'user-1', action: 'login' }),
      );
    });
  });

  describe('streamAuditLogsCsv', () => {
    it('should build query and stream results', async () => {
      const mockResponse: any = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        pipe: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      };

      const mockQueryStream = (async function* () {
        yield {
          audit_log_createdAt: new Date(),
          audit_log_actorId: 'actor-1',
          audit_log_action: 'user.login',
          audit_log_resourceType: 'user',
          audit_log_resourceId: 'res-1',
          audit_log_ipAddress: '127.0.0.1',
          audit_log_status: 'SUCCESS',
        };
      })();

      jest.spyOn(service['auditLogRepository'], 'createQueryBuilder').mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        stream: jest.fn().mockResolvedValue(mockQueryStream),
      } as any);

      await service.streamAuditLogsCsv(mockResponse, { from: '2026-06-24', to: '2026-06-25' });

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(service['auditLogRepository'].createQueryBuilder).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getMigrationHistory
  // ---------------------------------------------------------------------------
  describe('getMigrationHistory', () => {
    it('should return empty applied migrations and empty snapshots when neither exist', async () => {
      jest.spyOn(service['dataSource'], 'query').mockResolvedValue([]);
      jest.spyOn(service['migrationSnapshotRepository'], 'find').mockResolvedValue([]);

      const result = await service.getMigrationHistory();

      expect(result.appliedMigrations).toEqual([]);
      expect(result.snapshots).toEqual([]);
      expect(result.summary.totalApplied).toBe(0);
      expect(result.summary.totalSnapshots).toBe(0);
    });

    it('should return applied migrations from the TypeORM migrations table', async () => {
      const mockMigrations = [
        { id: 1, timestamp: '1760000000000', name: 'CreateNotificationPreferences1760000000000' },
        { id: 2, timestamp: '1761000000000', name: 'AddKycTierAndTransactionLimits1761000000000' },
      ];
      jest.spyOn(service['dataSource'], 'query').mockResolvedValue(mockMigrations);
      jest.spyOn(service['migrationSnapshotRepository'], 'find').mockResolvedValue([]);

      const result = await service.getMigrationHistory();

      expect(result.appliedMigrations).toHaveLength(2);
      expect(result.appliedMigrations[0].name).toBe('CreateNotificationPreferences1760000000000');
      expect(result.summary.totalApplied).toBe(2);
    });

    it('should return snapshot records with correct status counts', async () => {
      jest.spyOn(service['dataSource'], 'query').mockResolvedValue([]);

      const mockSnapshots: MigrationSnapshot[] = [
        { id: 'snap-1', environment: 'staging', snapshotKey: 'key-1', migrationCount: 2, status: SnapshotStatus.APPLIED, appliedAt: new Date(), rolledBackAt: null, takenAt: new Date() },
        { id: 'snap-2', environment: 'production', snapshotKey: 'key-2', migrationCount: 1, status: SnapshotStatus.ROLLED_BACK, appliedAt: new Date(), rolledBackAt: new Date(), takenAt: new Date() },
        { id: 'snap-3', environment: 'staging', snapshotKey: 'key-3', migrationCount: 3, status: SnapshotStatus.PENDING, appliedAt: null, rolledBackAt: null, takenAt: new Date() },
      ];
      jest.spyOn(service['migrationSnapshotRepository'], 'find').mockResolvedValue(mockSnapshots);

      const result = await service.getMigrationHistory();

      expect(result.snapshots).toHaveLength(3);
      expect(result.summary.totalSnapshots).toBe(3);
      expect(result.summary.appliedSnapshots).toBe(1);
      expect(result.summary.rolledBackSnapshots).toBe(1);
      expect(result.summary.pendingSnapshots).toBe(1);
    });

    it('should return empty applied migrations and log a warning when migrations table query fails', async () => {
      jest.spyOn(service['dataSource'], 'query').mockRejectedValue(new Error('relation "migrations" does not exist'));
      jest.spyOn(service['migrationSnapshotRepository'], 'find').mockResolvedValue([]);
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

      const result = await service.getMigrationHistory();

      expect(result.appliedMigrations).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not query migrations table'),
      );
    });

    it('should combine applied migrations and snapshots in the response', async () => {
      const mockMigrations = [
        { id: 1, timestamp: '1762000000000', name: 'CreateMigrationSnapshots1762000000000' },
      ];
      const mockSnapshot: MigrationSnapshot = {
        id: 'snap-1',
        environment: 'staging',
        snapshotKey: 'nexafx/pre-migration/staging/2026-06-27T00-00-00Z-1.dump',
        migrationCount: 1,
        status: SnapshotStatus.APPLIED,
        appliedAt: new Date(),
        rolledBackAt: null,
        takenAt: new Date(),
      };

      jest.spyOn(service['dataSource'], 'query').mockResolvedValue(mockMigrations);
      jest.spyOn(service['migrationSnapshotRepository'], 'find').mockResolvedValue([mockSnapshot]);

      const result = await service.getMigrationHistory();

      expect(result.appliedMigrations).toHaveLength(1);
      expect(result.snapshots).toHaveLength(1);
      expect(result.summary.totalApplied).toBe(1);
      expect(result.summary.totalSnapshots).toBe(1);
      expect(result.summary.appliedSnapshots).toBe(1);
    });
  });
});
