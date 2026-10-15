import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  Transaction,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import {
  LedgerAccountType,
  LedgerDirection,
  LedgerEntry,
} from '../entities/ledger-entry.entity';

@Injectable()
export class LedgerService {
  constructor(@Optional() private readonly dataSource?: DataSource) {}

  async record(
    transaction: Transaction,
    queryRunner: QueryRunner,
  ): Promise<LedgerEntry[]> {
    if (!queryRunner?.manager) {
      throw new BadRequestException(
        'A valid query runner is required to record ledger entries',
      );
    }

    const entries = this.buildEntries(transaction);
    const savedEntries = queryRunner.manager.create(LedgerEntry, entries);
    return queryRunner.manager.save(LedgerEntry, savedEntries);
  }

  private buildEntries(transaction: Transaction): Partial<LedgerEntry>[] {
    const amount = transaction.amount.toString();
    const currency = transaction.currency;

    if (transaction.type === TransactionType.DEPOSIT) {
      return [
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.CREDIT,
          amount,
          currency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_LIABILITY,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
        },
        ...this.feeEntries(transaction),
      ];
    }

    if (transaction.type === TransactionType.WITHDRAW) {
      return [
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.CREDIT,
          amount,
          currency,
        },
        ...this.feeEntries(transaction),
      ];
    }

    if (transaction.type === TransactionType.SWAP) {
      const toAmount = transaction.toAmount?.toString() ?? amount;
      const destinationCurrency = transaction.toCurrency ?? currency;

      return [
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.CREDIT,
          amount,
          currency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.DEBIT,
          amount: toAmount,
          currency: destinationCurrency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.CREDIT,
          amount: toAmount,
          currency: destinationCurrency,
        },
        // The user is debited amount + fee, so the fee leg debits the user and
        // credits revenue; the previous pair debited revenue and credited the
        // platform asset, which is the wrong direction and left the user's fee
        // unbooked.
        ...this.feeEntries(transaction),
      ];
    }

    if (transaction.type === TransactionType.LOAN_DISBURSEMENT) {
      return [
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.CREDIT,
          amount,
          currency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_LIABILITY,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
        },
      ];
    }

    if (transaction.type === TransactionType.LOAN_REPAYMENT) {
      return [
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.CREDIT,
          amount,
          currency,
        },
      ];
    }

    throw new BadRequestException(
      `Unsupported transaction type: ${transaction.type}`,
    );
  }

  /**
   * Fee legs: the user pays the fee, the platform books it as revenue. Without
   * these, a deposit or withdrawal with a fee produced ledger rows that did not
   * match the balance actually debited.
   */
  private feeEntries(transaction: Transaction): Partial<LedgerEntry>[] {
    const feeAmount = transaction.feeAmount?.toString() ?? '0';
    if (Number(feeAmount) <= 0) return [];

    const feeCurrency = transaction.feeCurrency ?? transaction.currency;

    return [
      {
        transactionId: transaction.id,
        accountType: LedgerAccountType.USER,
        direction: LedgerDirection.DEBIT,
        amount: feeAmount,
        currency: feeCurrency,
      },
      {
        transactionId: transaction.id,
        accountType: LedgerAccountType.FEE_REVENUE,
        direction: LedgerDirection.CREDIT,
        amount: feeAmount,
        currency: feeCurrency,
      },
    ];
  }

  /**
   * Posts the mirror of every entry already recorded for a transaction, so a
   * FAILED or CANCELLED transaction nets to zero per account type instead of
   * leaving phantom balances that the 6-hourly verification cannot spot.
   */
  async reverse(
    transaction: Transaction,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    const manager = queryRunner?.manager ?? this.dataSource?.manager;
    if (!manager) return;

    const entries = await manager.find(LedgerEntry, {
      where: { transactionId: transaction.id },
    });
    if (entries.length === 0) return;

    const mirrored = entries.map((entry) => ({
      transactionId: entry.transactionId,
      accountType: entry.accountType,
      direction:
        entry.direction === LedgerDirection.DEBIT
          ? LedgerDirection.CREDIT
          : LedgerDirection.DEBIT,
      amount: entry.amount,
      currency: entry.currency,
    }));

    await manager.save(LedgerEntry, manager.create(LedgerEntry, mirrored));
  }
}
