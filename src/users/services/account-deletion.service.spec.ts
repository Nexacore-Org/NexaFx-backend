import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountDeletionService } from './account-deletion.service';
import {
  DataRequest,
  DataRequestType,
  DataRequestStatus,
} from '../entities/data-request.entity';
import { User } from '../user.entity';
import { RefreshToken } from '../../tokens/refresh-token.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { BackupCode } from '../../two-factor/entities/backup-code.entity';
import { OAuthAccount } from '../../auth/entities/oauth-account.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';

describe('AccountDeletionService', () => {
  const dataRequestRepository = {
    findOne: jest.fn(),
    create: jest.fn((input: Partial<DataRequest>) => input),
    save: jest.fn(async (entity: Partial<DataRequest>) => entity),
    createQueryBuilder: jest.fn(),
  };
  const userRepository = { findOne: jest.fn() };
  const transactionRepository = { find: jest.fn(), delete: jest.fn() };
  const notificationRepository = { delete: jest.fn() };
  const kycRepository = { update: jest.fn() };
  const beneficiaryRepository = { update: jest.fn() };
  const auditLogRepository = { delete: jest.fn(), update: jest.fn() };
  const usersService = { findById: jest.fn() };
  const notificationsService = { create: jest.fn() };
  let queryRunnerMock: any;
  const dataSource = {
    createQueryRunner: jest.fn(),
  } as unknown as DataSource;

  const build = (): AccountDeletionService => {
    const instance = Object.create(
      AccountDeletionService.prototype,
    ) as AccountDeletionService;
    const deps = {
      userRepository,
      dataRequestRepository,
      transactionRepository,
      notificationRepository,
      kycRepository,
      beneficiaryRepository,
      auditLogRepository,
      usersService,
      notificationsService,
      dataSource,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      HARD_DELETE_DAYS: 30,
      AUDIT_LOG_RETENTION_DAYS: 365,
    };
    for (const [key, value] of Object.entries(deps)) {
      (instance as unknown as Record<string, unknown>)[key] = value;
    }
    return instance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dataRequestRepository.save.mockImplementation(
      async (entity: Partial<DataRequest>) => entity,
    );

    const deleteQb = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    queryRunnerMock = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn().mockResolvedValue({ id: 'user-1', email: 'x' }),
        save: jest.fn(async (_entity: any, obj: any) => obj),
        update: jest.fn(),
        delete: jest.fn(),
        createQueryBuilder: jest.fn(() => deleteQb),
      },
    };
    (dataSource.createQueryRunner as jest.Mock).mockReturnValue(queryRunnerMock);
  });

  describe('requestAccountDeletion', () => {
    it('creates a pending deletion request', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue(null);
      usersService.findById.mockResolvedValue({ id: 'user-1' });

      const result = await service.requestAccountDeletion('user-1');

      expect(result.type).toBe(DataRequestType.DELETION);
      expect(result.status).toBe(DataRequestStatus.PENDING);
    });

    it('returns 409 when a request is already in progress', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue({
        id: 'existing',
        status: DataRequestStatus.PROCESSING,
      });

      await expect(service.requestAccountDeletion('user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('hard delete transaction with real entities', () => {
    it('uses real entities/placeholders, no nonexistent table, and marks processed', async () => {
      const service = build();
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'req-1',
            userId: 'user-1',
            type: DataRequestType.DELETION,
            status: DataRequestStatus.COMPLETE,
            completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
            hardDeletedAt: null,
          },
        ]),
      };
      dataRequestRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.performHardDelete();

      expect(result).toEqual({ deleted: 1, processed: 1 });

      // refresh tokens via entity (not string table name)
      expect(queryRunnerMock.manager.update).toHaveBeenCalledWith(
        RefreshToken,
        { userId: 'user-1' },
        expect.any(Object),
      );
      // no string table targets used for KYC/refresh token updates
      const updateTargets = queryRunnerMock.manager.update.mock.calls.map((c: any[]) => c[0]);
      expect(updateTargets).not.toContain('refresh_token');
      expect(updateTargets).toContain(KycRecord);
      expect(updateTargets).toContain(Beneficiary);
      expect(updateTargets).toContain(Wallet);

      // KYC placeholders are non-null
      const kycCall = queryRunnerMock.manager.update.mock.calls.find((c: any[]) => c[0] === KycRecord);
      expect(kycCall[2].documentFrontKey).toBe('deleted');
      expect(kycCall[2].selfieKey).toBe('deleted');

      // no nonexistent rate_alert_price_history deletes
      const deleteCalls = queryRunnerMock.manager.delete.mock.calls;
      expect(deleteCalls.some((c: any[]) => c[0] === 'rate_alert_price_history')).toBe(false);
      expect(deleteCalls.some((c: any[]) => c[0] === Notification)).toBe(true);
      expect(deleteCalls.some((c: any[]) => c[0] === 'rate_alerts')).toBe(true);
      expect(deleteCalls.some((c: any[]) => c[0] === User)).toBe(true);

      // marks processed request so second run would skip (query filters hardDeletedAt IS NULL)
      expect(qb.andWhere).toHaveBeenCalledWith('dr.hardDeletedAt IS NULL');
      expect(dataRequestRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1', hardDeletedAt: expect.any(Date) }),
      );
      expect(queryRunnerMock.commitTransaction).toHaveBeenCalled();
    });
  });
});
