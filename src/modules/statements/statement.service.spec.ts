import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Statement } from './entities/statement.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { StatementService } from './statement.service';
import { WalletsService } from '../../wallets/wallets.service';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { createMockRepository } from '../../../test/mocks/factories';

// Prevent loading the real (heavy) service implementations, which pull in
// unrelated modules that do not load cleanly in isolation.
jest.mock('../../wallets/wallets.service', () => ({
  WalletsService: class {},
}));
jest.mock('../../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

const tx = (overrides: Partial<Transaction>): Partial<Transaction> => ({
  id: `tx-${Math.random()}`,
  userId: 'user-1',
  type: TransactionType.DEPOSIT,
  amount: '0.00000000',
  currency: 'XLM',
  status: TransactionStatus.SUCCESS,
  feeAmount: '0.00000000',
  createdAt: new Date('2026-04-10T12:00:00Z'),
  txHash: null,
  stellarTxHash: null,
  ...overrides,
});

const buildQueryBuilder = (overrides: any = {}) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  addGroupBy: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue(null),
  getRawMany: jest.fn().mockResolvedValue([]),
  ...overrides,
});

describe('StatementService', () => {
  let service: StatementService;
  let statementRepo: any;
  let transactionRepo: any;
  let walletsService: any;
  let notificationsService: any;
  let qb: any;

  beforeEach(async () => {
    statementRepo = createMockRepository();
    transactionRepo = createMockRepository();
    qb = buildQueryBuilder();
    transactionRepo.createQueryBuilder.mockReturnValue(qb);
    walletsService = {
      findAllByUser: jest.fn().mockResolvedValue([]),
    };
    notificationsService = {
      createAndSend: jest.fn().mockResolvedValue(undefined),
    };
    const usersService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatementService,
        { provide: getRepositoryToken(Statement), useValue: statementRepo },
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepo,
        },
        { provide: WalletsService, useValue: walletsService },
        { provide: UsersService, useValue: usersService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<StatementService>(StatementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('returns the existing statement for an already-generated period without duplicating', async () => {
      const existing = {
        id: 'stmt-1',
        userId: 'user-1',
        currency: 'XLM',
        year: 2026,
        month: 4,
      };
      statementRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.generate('user-1', 'XLM', 2026, 4);

      expect(result).toEqual(existing);
      expect(transactionRepo.find).not.toHaveBeenCalled();
      expect(statementRepo.save).not.toHaveBeenCalled();
      expect(statementRepo.create).not.toHaveBeenCalled();
    });

    it('reconciles opening/closing balances and totals with the period transactions', async () => {
      statementRepo.findOne.mockResolvedValue(null); // no existing, no previous statement
      walletsService.findAllByUser.mockResolvedValue([]); // -> opening balance 0

      transactionRepo.find.mockResolvedValue([
        tx({ type: TransactionType.DEPOSIT, amount: '1000', feeAmount: '5' }),
        tx({ type: TransactionType.DEPOSIT, amount: '250', feeAmount: '0' }),
        tx({ type: TransactionType.WITHDRAW, amount: '100', feeAmount: '2' }),
        tx({
          type: TransactionType.LOAN_DISBURSEMENT,
          amount: '500',
          feeAmount: '0',
        }),
        tx({
          type: TransactionType.LOAN_REPAYMENT,
          amount: '200',
          feeAmount: '4',
        }),
        tx({ type: TransactionType.SWAP, amount: '50', feeAmount: '1' }),
      ]);

      statementRepo.create.mockImplementation((e) => e);
      statementRepo.save.mockImplementation((e) =>
        Promise.resolve({ id: 'stmt-1', ...e }),
      );

      const result = await service.generate('user-1', 'XLM', 2026, 4);

      // Queries only SUCCESS transactions ordered ascending.
      const findWhere = transactionRepo.find.mock.calls[0][0];
      expect(findWhere.where).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          currency: 'XLM',
          status: TransactionStatus.SUCCESS,
        }),
      );
      expect(findWhere.where.createdAt).toBeDefined();
      expect(findWhere.order).toEqual({ createdAt: 'ASC' });
      expect(statementRepo.create.mock.calls[0][0].transactionCount).toBe(6);

      expect(result.openingBalance).toBe('0.00000000');
      // Credits: 1000 + 250 + 500 = 1750
      expect(result.totalCredits).toBe('1750.00000000');
      // Debits: 100 + 200 = 300
      expect(result.totalDebits).toBe('300.00000000');
      // Fees: 5 + 2 + 4 + 1 = 12
      expect(result.totalFees).toBe('12.00000000');
      // Closing = 0 + 1750 - 300 = 1450
      expect(result.closingBalance).toBe('1450.00000000');

      // Decimal.js-aware checks for every monetary field.
      expect(new Decimal(result.totalCredits).eq(1750)).toBe(true);
      expect(new Decimal(result.totalDebits).eq(300)).toBe(true);
      expect(new Decimal(result.totalFees).eq(12)).toBe(true);
      expect(new Decimal(result.closingBalance).eq(1450)).toBe(true);
    });

    it('derives opening balance from wallet balance and net change when no previous statement exists', async () => {
      statementRepo.findOne.mockResolvedValue(null);
      walletsService.findAllByUser.mockResolvedValue([
        { currency: 'XLM', balance: '1000.00000000' },
      ]);
      qb.getRawOne.mockResolvedValue({ netChange: '250.00000000' });
      transactionRepo.find.mockResolvedValue([]);
      statementRepo.create.mockImplementation((e) => e);
      statementRepo.save.mockImplementation((e) =>
        Promise.resolve({ id: 's', ...e }),
      );

      const result = await service.generate('user-1', 'XLM', 2026, 4);

      expect(result.openingBalance).toBe('750.00000000');
    });
  });

  describe('calculateOpeningBalance (via private helper)', () => {
    it('reuses the previous month closing balance when a prior statement exists', async () => {
      statementRepo.findOne.mockResolvedValue({
        closingBalance: '500.00000000',
      });

      const result = await (service as any).calculateOpeningBalance(
        'user-1',
        'XLM',
        2026,
        4,
      );

      expect(statementRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', currency: 'XLM', year: 2026, month: 3 },
      });
      expect(result).toBe('500.00000000');
    });
  });

  describe('getStatementDetail', () => {
    it('generates on demand when the statement does not exist yet', async () => {
      statementRepo.findOne.mockResolvedValue(null);
      walletsService.findAllByUser.mockResolvedValue([]);
      transactionRepo.find.mockResolvedValue([
        tx({ type: TransactionType.DEPOSIT, amount: '100' }),
      ]);
      statementRepo.create.mockImplementation((e) => e);
      statementRepo.save.mockImplementation((e) =>
        Promise.resolve({ id: 'stmt-1', ...e }),
      );

      const detail = await service.getStatementDetail('user-1', 2026, 4, 'XLM');

      expect(statementRepo.save).toHaveBeenCalled();
      expect(detail.id).toBe('stmt-1');
      expect(detail.transactions).toHaveLength(1);
    });

    it('builds rows with correct running balances from real transactions', async () => {
      statementRepo.findOne.mockResolvedValue({
        id: 'stmt-1',
        currency: 'XLM',
        year: 2026,
        month: 4,
        openingBalance: '100.00000000',
        closingBalance: '130.00000000',
        totalCredits: '50.00000000',
        totalDebits: '20.00000000',
        totalFees: '0.00000000',
        transactionCount: 2,
      });
      transactionRepo.find.mockResolvedValue([
        tx({
          type: TransactionType.DEPOSIT,
          amount: '50',
          createdAt: new Date('2026-04-01T08:00:00Z'),
        }),
        tx({
          type: TransactionType.WITHDRAW,
          amount: '20',
          createdAt: new Date('2026-04-02T08:00:00Z'),
        }),
      ]);

      const detail = await service.getStatementDetail('user-1', 2026, 4, 'XLM');

      expect(detail.transactions[0]).toEqual(
        expect.objectContaining({
          type: TransactionType.DEPOSIT,
          credit: '50.00000000',
          debit: null,
          runningBalance: '150.00000000',
          description: 'Deposit',
        }),
      );
      expect(detail.transactions[1]).toEqual(
        expect.objectContaining({
          type: TransactionType.WITHDRAW,
          credit: null,
          debit: '20.00000000',
          runningBalance: '130.00000000',
          description: 'Withdrawal',
        }),
      );
      expect(new Decimal(detail.transactions[1].runningBalance).eq(130)).toBe(
        true,
      );
    });

    it('uses txHash falling back to stellarTxHash in the row output', async () => {
      statementRepo.findOne.mockResolvedValue({
        id: 'stmt-1',
        currency: 'XLM',
        year: 2026,
        month: 4,
        openingBalance: '0.00000000',
        transactionCount: 1,
      });
      transactionRepo.find.mockResolvedValue([
        tx({
          type: TransactionType.DEPOSIT,
          amount: '5',
          txHash: null,
          stellarTxHash: 'stellar-hash',
        }),
      ]);

      const detail = await service.getStatementDetail('user-1', 2026, 4, 'XLM');

      expect(detail.transactions[0].txHash).toBe('stellar-hash');
    });
  });

  describe('listStatements', () => {
    it('lists statements for the user ordered by year, month, currency', async () => {
      statementRepo.find.mockResolvedValue([{ id: 'stmt-1' }]);

      const result = await service.listStatements('user-1');

      expect(statementRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { year: 'DESC', month: 'DESC', currency: 'ASC' },
      });
      expect(result).toEqual([{ id: 'stmt-1' }]);
    });
  });

  describe('generateForAllActiveUsers', () => {
    it('generates a statement and sends a notification for each active user/currency', async () => {
      qb.getRawMany.mockResolvedValue([{ userId: 'user-1', currency: 'XLM' }]);
      transactionRepo.find.mockResolvedValue([]);
      statementRepo.findOne.mockResolvedValue(null);
      walletsService.findAllByUser.mockResolvedValue([]);
      statementRepo.create.mockImplementation((e) => e);
      statementRepo.save.mockImplementation((e) => Promise.resolve({ ...e }));

      await service.generateForAllActiveUsers(2026, 4);

      expect(notificationsService.createAndSend).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          title: expect.stringContaining('April 2026 XLM Statement Ready'),
          type: 'STATEMENT_READY',
        }),
      );
      expect(statementRepo.save).toHaveBeenCalledTimes(1);
    });

    it('continues processing other users when one generation fails', async () => {
      qb.getRawMany.mockResolvedValue([
        { userId: 'bad', currency: 'XLM' },
        { userId: 'good', currency: 'XLM' },
      ]);
      transactionRepo.find.mockImplementation((opts: any) =>
        opts.where.userId === 'bad'
          ? Promise.reject(new Error('boom'))
          : Promise.resolve([]),
      );
      statementRepo.findOne.mockResolvedValue(null);
      walletsService.findAllByUser.mockResolvedValue([]);
      statementRepo.create.mockImplementation((e) => e);
      statementRepo.save.mockImplementation((e) => Promise.resolve({ ...e }));

      await expect(
        service.generateForAllActiveUsers(2026, 4),
      ).resolves.toBeUndefined();

      // Only the good user gets a statement and a notification.
      expect(statementRepo.save).toHaveBeenCalledTimes(1);
      expect(notificationsService.createAndSend).toHaveBeenCalledWith(
        'good',
        expect.objectContaining({}),
      );
      expect(notificationsService.createAndSend).not.toHaveBeenCalledWith(
        'bad',
        expect.objectContaining({}),
      );
    });
  });

  describe('generatePDFContent', () => {
    it('renders a statement with the summary and every transaction', () => {
      const detail: any = {
        currency: 'XLM',
        year: 2026,
        month: 4,
        openingBalance: '0.00000000',
        closingBalance: '50.00000000',
        totalCredits: '50.00000000',
        totalDebits: '0.00000000',
        totalFees: '0.00000000',
        transactionCount: 1,
        transactions: [
          {
            date: '2026-04-01T00:00:00Z',
            description: 'Deposit',
            type: 'DEPOSIT',
            debit: null,
            credit: '50.00000000',
            runningBalance: '50.00000000',
            txHash: null,
          },
        ],
      };

      const content = service.generatePDFContent(detail);

      expect(content).toContain('NexaFX Account Statement');
      expect(content).toContain('Period: April 2026');
      expect(content).toContain('Opening Balance:');
      expect(content).toContain('Closing Balance:');
      expect(content).toContain('Deposit');
    });
  });

  describe('generateCSVContent', () => {
    it('emits a CSV with header and closing-balance summary', () => {
      const detail: any = {
        currency: 'XLM',
        year: 2026,
        month: 4,
        openingBalance: '0.00000000',
        closingBalance: '50.00000000',
        totalCredits: '50.00000000',
        totalDebits: '0.00000000',
        totalFees: '0.00000000',
        transactionCount: 1,
        transactions: [
          {
            date: '2026-04-01T00:00:00Z',
            description: 'Deposit',
            type: 'DEPOSIT',
            debit: null,
            credit: '50.00000000',
            runningBalance: '50.00000000',
            txHash: 'abc',
          },
        ],
      };

      const content = service.generateCSVContent(detail);

      expect(content).toContain('NexaFX Account Statement');
      expect(content).toContain(
        'Date,Description,Type,Debit,Credit,Running Balance,Transaction Hash',
      );
      expect(content).toContain('Closing Balance,,,,,50.00000000');
      expect(content).toContain('"Deposit"');
    });
  });
});
