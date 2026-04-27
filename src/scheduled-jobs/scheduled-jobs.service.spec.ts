jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduledJobsService } from './scheduled-jobs.service';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { TransactionsService } from '../transactions/services/transaction.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';

describe('ScheduledJobsService', () => {
  let service: ScheduledJobsService;

  const mockTransactionRepository = {
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockNotificationRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockTransactionsService = {};
  const mockStellarService = {};
  const mockNotificationsService = {};
  const mockUsersService = {
    syncWalletBalanceSnapshots: jest.fn(),
  };
  const mockRateAlertsService = {
    checkAndTriggerAlerts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledJobsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepository,
        },
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: RateAlertsService,
          useValue: mockRateAlertsService,
        },
      ],
    }).compile();

    service = module.get<ScheduledJobsService>(ScheduledJobsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cron handlers', () => {
    it.each([
      ['syncWalletBalances', () => service.syncWalletBalances()],
      [
        'reconcilePendingTransactions',
        () => service.reconcilePendingTransactions(),
      ],
      ['retryFailedTransactions', () => service.retryFailedTransactions()],
      ['checkRateAlerts', () => service.checkRateAlerts()],
      ['cleanupOldNotifications', () => service.cleanupOldNotifications()],
      [
        'syncWalletBalancesSnapshot',
        () => service.syncWalletBalancesSnapshot(),
      ],
    ])('%s is directly callable without throwing', async (_name, callCron) => {
      const deleteQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      const claimQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        claimQueryBuilder,
      );
      mockTransactionRepository.find.mockResolvedValue([]);
      mockNotificationRepository.createQueryBuilder.mockReturnValue(
        deleteQueryBuilder,
      );
      mockUsersService.syncWalletBalanceSnapshots.mockResolvedValue({
        processed: 0,
        updated: 0,
        failed: 0,
      });
      mockRateAlertsService.checkAndTriggerAlerts.mockResolvedValue({
        checked: 0,
        triggered: 0,
        reactivated: 0,
      });

      await expect(callCron()).resolves.toBeUndefined();
    });
  });

  describe('claimPendingTransactions', () => {
    it('should atomically claim pending transactions', async () => {
      const mockTransactions = [
        {
          id: '1',
          status: TransactionStatus.PENDING,
          processingLockedBy: 'test-host',
          processingLockedAt: new Date(),
        },
      ];

      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionRepository.find.mockResolvedValue(mockTransactions);

      const result = await service['claimPendingTransactions']();

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(Transaction);
      const [claimSetPayload] = mockQueryBuilder.set.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(claimSetPayload.processingLockedAt).toBeInstanceOf(Date);
      expect(typeof claimSetPayload.processingLockedBy).toBe('string');

      const whereCall = mockQueryBuilder.where.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const [whereClause, whereParams] = whereCall;
      expect(whereClause).toBe(
        'status = :status AND ("processingLockedAt" IS NULL OR "processingLockedAt" < :expiry)',
      );
      expect(whereParams.status).toBe(TransactionStatus.PENDING);
      expect(whereParams.expiry).toBeInstanceOf(Date);
      expect(result).toEqual(mockTransactions);
    });

    it('should return empty array when no transactions are claimed', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service['claimPendingTransactions']();

      expect(result).toEqual([]);
      expect(mockTransactionRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('claimTransactionForRetry', () => {
    it('should atomically claim a transaction for retry', async () => {
      const transactionId = 'test-id';
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service['claimTransactionForRetry'](transactionId);

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(Transaction);
      const [retrySetPayload] = mockQueryBuilder.set.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(retrySetPayload.processingLockedAt).toBeInstanceOf(Date);
      expect(typeof retrySetPayload.processingLockedBy).toBe('string');

      const whereCall = mockQueryBuilder.where.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const [whereClause, whereParams] = whereCall;
      expect(whereClause).toBe(
        'id = :id AND status = :status AND ("processingLockedAt" IS NULL OR "processingLockedAt" < :expiry)',
      );
      expect(whereParams.id).toBe(transactionId);
      expect(whereParams.status).toBe(TransactionStatus.FAILED);
      expect(whereParams.expiry).toBeInstanceOf(Date);
      expect(result).toBe(true);
    });

    it('should return false when transaction cannot be claimed', async () => {
      const transactionId = 'test-id';
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service['claimTransactionForRetry'](transactionId);

      expect(result).toBe(false);
    });
  });

  describe('clearTransactionLock', () => {
    it('should clear the processing lock for a transaction', async () => {
      const transactionId = 'test-id';
      mockTransactionRepository.update.mockResolvedValue({ affected: 1 });

      await service['clearTransactionLock'](transactionId);

      expect(mockTransactionRepository.update).toHaveBeenCalledWith(
        transactionId,
        {
          processingLockedAt: null,
          processingLockedBy: null,
        },
      );
    });
  });

  describe('lock expiry scenario', () => {
    it('should allow claiming a transaction with an expired lock', async () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const mockTransactions = [
        {
          id: '1',
          status: TransactionStatus.PENDING,
          processingLockedBy: 'old-host',
          processingLockedAt: sixMinutesAgo,
        },
      ];

      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
      mockTransactionRepository.find.mockResolvedValue(mockTransactions);

      const result = await service['claimPendingTransactions']();

      expect(result).toEqual(mockTransactions);
      const whereCall = mockQueryBuilder.where.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const [whereClause, whereParams] = whereCall;
      expect(whereClause).toBe(
        'status = :status AND ("processingLockedAt" IS NULL OR "processingLockedAt" < :expiry)',
      );
      expect(whereParams.status).toBe(TransactionStatus.PENDING);
      expect(whereParams.expiry).toBeInstanceOf(Date);
    });

    it('should not claim a transaction with a recent lock', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service['claimPendingTransactions']();

      expect(result).toEqual([]);
    });
  });

  describe('concurrent job runs', () => {
    it('should only allow one instance to claim each transaction', async () => {
      // Simulate two concurrent job runs
      const mockQueryBuilder1 = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      const mockQueryBuilder2 = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      const mockTransactions = [
        {
          id: '1',
          status: TransactionStatus.PENDING,
          processingLockedBy: 'instance-1',
          processingLockedAt: new Date(),
        },
        {
          id: '2',
          status: TransactionStatus.PENDING,
          processingLockedBy: 'instance-1',
          processingLockedAt: new Date(),
        },
      ];

      // First instance claims transactions
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder1,
      );
      mockTransactionRepository.find.mockResolvedValue(mockTransactions);

      const result1 = await service['claimPendingTransactions']();

      // Second instance tries to claim the same transactions
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder2,
      );

      const result2 = await service['claimPendingTransactions']();

      // First instance should get the transactions
      expect(result1).toEqual(mockTransactions);
      // Second instance should get empty array
      expect(result2).toEqual([]);
    });
  });
});
