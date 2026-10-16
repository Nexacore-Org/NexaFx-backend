import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TransactionReversalService } from './transaction-reversal.service';
import {
  ReversalStatus,
  TransactionReversal,
} from '../entities/transaction-reversal.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

describe('TransactionReversalService', () => {
  let service: TransactionReversalService;
  let originalTransaction: Transaction;
  let reversal: TransactionReversal | null;
  let compensatingTransaction: Transaction | null;

  const manager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((callback) => callback(manager)),
  };
  const reversalRepository = {
    findOne: jest.fn(),
  };
  const auditLogsService = {
    logSystemEvent: jest.fn(),
  };
  const notificationsService = {
    dispatch: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'REVERSAL_CONFIRMATION_TTL_MINUTES' ? 30 : undefined,
    ),
  };

  beforeEach(async () => {
    originalTransaction = {
      id: 'transaction-1',
      userId: 'user-1',
      type: TransactionType.WITHDRAW,
      amount: '25.00',
      currency: 'USD',
      status: TransactionStatus.SUCCESS,
      createdAt: new Date(),
    } as Transaction;
    reversal = null;
    compensatingTransaction = null;

    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity === TransactionReversal) return reversal;
      if (entity === Transaction) {
        if (options.where.id === originalTransaction.id) {
          return originalTransaction;
        }
        if (options.where.reference) return compensatingTransaction;
      }
      return null;
    });
    manager.create.mockImplementation((entity, values) => ({
      ...values,
      id:
        entity === TransactionReversal
          ? 'reversal-1'
          : 'compensating-transaction-1',
    }));
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === TransactionReversal) {
        reversal = value;
        return value;
      }
      compensatingTransaction = value;
      return value;
    });
    dataSource.transaction.mockImplementation((callback) => callback(manager));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionReversalService,
        {
          provide: getRepositoryToken(TransactionReversal),
          useValue: reversalRepository,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get(TransactionReversalService);
    jest.clearAllMocks();
  });

  it('creates the preview inside a transaction and locks the transaction row', async () => {
    const result = await service.previewReversal('transaction-1', 'admin-1');

    expect(result).toHaveProperty('reversalId', 'reversal-1');
    expect(manager.findOne).toHaveBeenCalledWith(
      Transaction,
      expect.objectContaining({
        where: { id: 'transaction-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(reversal?.status).toBe(ReversalStatus.PENDING_CONFIRMATION);
    expect(reversal?.authorisedBy).toBe('admin-1');
  });

  it('requires a different administrator to confirm', async () => {
    reversal = {
      id: 'reversal-1',
      transactionId: 'transaction-1',
      authorisedBy: 'admin-1',
      status: ReversalStatus.PENDING_CONFIRMATION,
    } as TransactionReversal;

    await expect(
      service.confirmReversal('transaction-1', 'admin-1', {
        reason: 'Requested by customer',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(manager.save).not.toHaveBeenCalledWith(
      Transaction,
      expect.anything(),
    );
  });

  it('creates one compensating transaction and completes the reversal atomically', async () => {
    reversal = {
      id: 'reversal-1',
      transactionId: 'transaction-1',
      authorisedBy: 'admin-1',
      status: ReversalStatus.PENDING_CONFIRMATION,
    } as TransactionReversal;

    const result = await service.confirmReversal(
      'transaction-1',
      'admin-2',
      { reason: 'Requested by customer', legalReference: 'CASE-1' },
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(compensatingTransaction?.reference).toBe('REVERSAL:transaction-1');
    expect(result.status).toBe(ReversalStatus.COMPLETED);
    expect(result.reversalTransactionId).toBe(
      'compensating-transaction-1',
    );
    expect(auditLogsService.logSystemEvent).toHaveBeenCalledTimes(1);
    expect(notificationsService.dispatch).toHaveBeenCalledTimes(1);
  });

  it('allows retrying a failed reversal by creating a new preview', async () => {
    reversal = {
      id: 'reversal-1',
      transactionId: 'transaction-1',
      authorisedBy: 'admin-1',
      status: ReversalStatus.FAILED,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    } as TransactionReversal;

    await service.previewReversal('transaction-1', 'admin-2');

    expect(reversal?.status).toBe(ReversalStatus.PENDING_CONFIRMATION);
    expect(reversal?.authorisedBy).toBe('admin-2');
    expect(reversal?.createdAt.getTime()).toBeGreaterThan(
      Date.now() - 1000,
    );
  });

  it('allows refreshing an expired preview', async () => {
    reversal = {
      id: 'reversal-1',
      transactionId: 'transaction-1',
      authorisedBy: 'admin-1',
      status: ReversalStatus.PENDING_CONFIRMATION,
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    } as TransactionReversal;

    await service.previewReversal('transaction-1', 'admin-2');

    expect(reversal?.authorisedBy).toBe('admin-2');
    expect(reversal?.createdAt.getTime()).toBeGreaterThan(
      Date.now() - 1000,
    );
  });

  it('rejects a fresh pending preview instead of replacing its authorizer', async () => {
    reversal = {
      id: 'reversal-1',
      transactionId: 'transaction-1',
      authorisedBy: 'admin-1',
      status: ReversalStatus.PENDING_CONFIRMATION,
      createdAt: new Date(),
    } as TransactionReversal;

    await expect(
      service.previewReversal('transaction-1', 'admin-2'),
    ).rejects.toThrow(ConflictException);
  });

  it('rechecks original transaction status at confirmation', async () => {
    reversal = {
      id: 'reversal-1',
      transactionId: 'transaction-1',
      authorisedBy: 'admin-1',
      status: ReversalStatus.PENDING_CONFIRMATION,
    } as TransactionReversal;
    originalTransaction.status = TransactionStatus.FAILED;

    await expect(
      service.confirmReversal('transaction-1', 'admin-2', {
        reason: 'Requested by customer',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(manager.save).not.toHaveBeenCalledWith(
      Transaction,
      expect.anything(),
    );
  });
});
