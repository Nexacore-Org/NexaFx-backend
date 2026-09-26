import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import {
  LedgerAccountType,
  LedgerDirection,
} from '../entities/ledger-entry.entity';
import {
  Transaction,
  TransactionType,
} from '../../transactions/entities/transaction.entity';

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-1',
    type: TransactionType.DEPOSIT,
    amount: '100.00000000',
    currency: 'USD',
    feeAmount: null,
    feeCurrency: null,
    toAmount: null,
    toCurrency: null,
    ...overrides,
  }) as Transaction;

const makeQueryRunner = (overrides: any = {}) => ({
  manager: {
    create: jest.fn((_, entries) => entries),
    save: jest.fn(async (_, entries) => entries),
    ...overrides.manager,
  },
  ...overrides,
});

describe('LedgerService', () => {
  let service: LedgerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LedgerService],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record()', () => {
    it('throws BadRequestException when queryRunner has no manager', async () => {
      const tx = makeTransaction();
      await expect(service.record(tx, {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when queryRunner is null', async () => {
      const tx = makeTransaction();
      await expect(service.record(tx, null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('records 2 entries for DEPOSIT', async () => {
      const tx = makeTransaction({ type: TransactionType.DEPOSIT });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);

      expect(qr.manager.create).toHaveBeenCalledTimes(1);
      expect(qr.manager.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);

      const credit = result.find(
        (e: any) =>
          e.accountType === LedgerAccountType.USER &&
          e.direction === LedgerDirection.CREDIT,
      );
      const debit = result.find(
        (e: any) =>
          e.accountType === LedgerAccountType.PLATFORM_LIABILITY &&
          e.direction === LedgerDirection.DEBIT,
      );
      expect(credit).toBeDefined();
      expect(debit).toBeDefined();
      expect(credit?.amount).toBe('100.00000000');
      expect(credit?.currency).toBe('USD');
    });

    it('records 2 entries for WITHDRAW', async () => {
      const tx = makeTransaction({ type: TransactionType.WITHDRAW });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);
      expect(result).toHaveLength(2);

      const userDebit = result.find(
        (e: any) =>
          e.accountType === LedgerAccountType.USER &&
          e.direction === LedgerDirection.DEBIT,
      );
      const platformCredit = result.find(
        (e: any) =>
          e.accountType === LedgerAccountType.PLATFORM_ASSET &&
          e.direction === LedgerDirection.CREDIT,
      );
      expect(userDebit).toBeDefined();
      expect(platformCredit).toBeDefined();
    });

    it('records 6 entries for SWAP including fee entries', async () => {
      const tx = makeTransaction({
        type: TransactionType.SWAP,
        amount: '200.00000000',
        currency: 'USD',
        toAmount: '180000.00000000',
        toCurrency: 'NGN',
        feeAmount: '2.00000000',
        feeCurrency: 'USD',
      });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);
      expect(result).toHaveLength(6);

      const feeEntry = result.find(
        (e: any) => e.accountType === LedgerAccountType.FEE_REVENUE,
      );
      expect(feeEntry).toBeDefined();
      expect(feeEntry?.amount).toBe('2.00000000');
      expect(feeEntry?.currency).toBe('USD');
    });

    it('uses same currency for fee when feeCurrency is null on SWAP', async () => {
      const tx = makeTransaction({
        type: TransactionType.SWAP,
        amount: '100.00000000',
        currency: 'USD',
        toAmount: '90000.00000000',
        toCurrency: 'NGN',
        feeAmount: null,
        feeCurrency: null,
      });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);
      expect(result).toHaveLength(6);

      const feeEntry = result.find(
        (e: any) => e.accountType === LedgerAccountType.FEE_REVENUE,
      );
      expect(feeEntry?.amount).toBe('0.00000000');
      expect(feeEntry?.currency).toBe('USD');
    });

    it('records 2 entries for LOAN_DISBURSEMENT', async () => {
      const tx = makeTransaction({ type: TransactionType.LOAN_DISBURSEMENT });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);
      expect(result).toHaveLength(2);

      const userCredit = result.find(
        (e: any) =>
          e.accountType === LedgerAccountType.USER &&
          e.direction === LedgerDirection.CREDIT,
      );
      expect(userCredit).toBeDefined();
    });

    it('records 2 entries for LOAN_REPAYMENT', async () => {
      const tx = makeTransaction({ type: TransactionType.LOAN_REPAYMENT });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);
      expect(result).toHaveLength(2);

      const userDebit = result.find(
        (e: any) =>
          e.accountType === LedgerAccountType.USER &&
          e.direction === LedgerDirection.DEBIT,
      );
      expect(userDebit).toBeDefined();
    });

    it('throws BadRequestException for unsupported transaction type', async () => {
      const tx = makeTransaction({ type: 'UNSUPPORTED_TYPE' as any });
      const qr = makeQueryRunner();

      await expect(service.record(tx, qr)).rejects.toThrow(BadRequestException);
    });

    it('attaches transactionId to every entry', async () => {
      const tx = makeTransaction({
        id: 'tx-unique-id',
        type: TransactionType.DEPOSIT,
      });
      const qr = makeQueryRunner();

      const result = await service.record(tx, qr);
      result.forEach((entry: any) => {
        expect(entry.transactionId).toBe('tx-unique-id');
      });
    });
  });
});
