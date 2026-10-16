import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { UserRole } from '../../users/user.entity';
import { TransactionsService } from './transaction.service';

/**
 * Regression guard for POST /transactions/:id/verify.
 *
 * The controller called verifyTransaction(id, req.user.userId, req.user.id,
 * req.user.role). req.user.id is not a field the JWT strategy sets, so
 * requestingUserRole was always undefined: the "already verified" guard
 * never ran and every repeat call on a completed deposit credited the
 * balance again.
 *
 * The service is built without the DI container - it takes 20+ constructor
 * dependencies - and only the fields verifyTransaction touches are attached.
 */
describe('TransactionsService.verifyTransaction', () => {
  let service: TransactionsService;

  const transactionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const stellarService = { verifyTransaction: jest.fn() };
  const activityFeedService = { append: jest.fn() };
  const redisService = { delete: jest.fn() };
  const amlService = { queueScreening: jest.fn() };
  const auditLogsService = { logAuthEvent: jest.fn() };
  const webhookService = { dispatch: jest.fn() };
  const taxQueue = { add: jest.fn() };
  const microSavingsService = { evaluate: jest.fn() };
  const usersService = { findById: jest.fn(), updateByUserId: jest.fn() };

  const makeTransaction = (overrides: Partial<Transaction> = {}) =>
    ({
      id: 'tx-1',
      userId: 'user-1',
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      amount: '100.00000000',
      currency: 'XLM',
      txHash: 'hash-1',
      ...overrides,
    }) as Transaction;

  const build = (): TransactionsService => {
    const instance = Object.create(
      TransactionsService.prototype,
    ) as TransactionsService;
    const deps = {
      transactionRepository,
      stellarService,
      activityFeedService,
      redisService,
      amlService,
      auditLogsService,
      webhookService,
      taxQueue,
      microSavingsService,
      usersService,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      sendTransactionNotification: jest.fn(),
      updateUserBalance: jest.fn(),
    };
    for (const [key, value] of Object.entries(deps)) {
      (instance as unknown as Record<string, unknown>)[key] = value;
    }
    return instance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = build();
    transactionRepository.update.mockResolvedValue({ affected: 1 });
    transactionRepository.save.mockImplementation(async (t: Transaction) => t);
    stellarService.verifyTransaction.mockResolvedValue({ status: 'SUCCESS' });
  });

  describe('argument mapping', () => {
    it('treats ADMIN as an admin', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ userId: 'someone-else' }),
      );

      await expect(
        service.verifyTransaction('tx-1', 'admin-1', UserRole.ADMIN, 'admin-1'),
      ).resolves.toBeDefined();
    });

    it('treats SUPER_ADMIN as an admin as well', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ userId: 'someone-else' }),
      );

      await expect(
        service.verifyTransaction(
          'tx-1',
          'super-1',
          UserRole.SUPER_ADMIN,
          'super-1',
        ),
      ).resolves.toBeDefined();
    });

    it('refuses a non-owner', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ userId: 'someone-else' }),
      );

      await expect(
        service.verifyTransaction('tx-1', 'user-1', UserRole.USER, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('status guard', () => {
    it('refuses a non-PENDING transaction for a regular user', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ status: TransactionStatus.SUCCESS }),
      );

      await expect(
        service.verifyTransaction('tx-1', 'user-1', UserRole.USER, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses even when no role reaches the service at all', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ status: TransactionStatus.SUCCESS }),
      );

      await expect(
        service.verifyTransaction('tx-1', 'user-1', undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets an admin re-verify', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ status: TransactionStatus.SUCCESS }),
      );

      await expect(
        service.verifyTransaction('tx-1', 'admin-1', UserRole.ADMIN, 'admin-1'),
      ).resolves.toBeDefined();
    });
  });

  describe('balance credit', () => {
    it('credits a pending deposit exactly once', async () => {
      transactionRepository.findOne.mockResolvedValue(makeTransaction());

      await service.verifyTransaction('tx-1', 'user-1', UserRole.USER, 'user-1');

      // The transition is claimed conditionally, so a second caller affects
      // no rows and cannot credit again.
      expect(transactionRepository.update).toHaveBeenCalledWith(
        { id: 'tx-1', status: TransactionStatus.PENDING },
        { status: TransactionStatus.SUCCESS },
      );
      expect(
        (service as unknown as { updateUserBalance: jest.Mock })
          .updateUserBalance,
      ).toHaveBeenCalledWith('user-1', 'XLM', 100);
    });

    it('does not credit when the row was already claimed', async () => {
      transactionRepository.findOne.mockResolvedValue(makeTransaction());
      transactionRepository.update.mockResolvedValue({ affected: 0 });

      await service.verifyTransaction('tx-1', 'user-1', UserRole.USER, 'user-1');

      expect(
        (service as unknown as { updateUserBalance: jest.Mock })
          .updateUserBalance,
      ).not.toHaveBeenCalled();
    });

    it('rejects an unknown transaction', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.verifyTransaction('missing', 'user-1', UserRole.USER, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a transaction without a blockchain hash', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTransaction({ txHash: null as unknown as string }),
      );

      await expect(
        service.verifyTransaction('tx-1', 'user-1', UserRole.USER, 'user-1'),
      ).rejects.toThrow(/blockchain hash/i);
    });
  });
});
