import { Injectable, BadRequestException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { Transaction, TransactionType } from '../../transactions/entities/transaction.entity';
import {
  LedgerAccountType,
  LedgerDirection,
  LedgerEntry,
} from '../entities/ledger-entry.entity';

@Injectable()
export class LedgerService {
  async record(transaction: Transaction, queryRunner: QueryRunner): Promise<LedgerEntry[]> {
    if (!queryRunner?.manager) {
      throw new BadRequestException('A valid query runner is required to record ledger entries');
    }

    const entries = this.buildEntries(transaction);
    const savedEntries = queryRunner.manager.create(LedgerEntry, entries);
    return queryRunner.manager.save(LedgerEntry, savedEntries);
  }

  private buildEntries(transaction: Transaction): Partial<LedgerEntry>[] {
    const amount = transaction.amount.toString();
    const currency = transaction.currency;
    const feeAmount = transaction.feeAmount?.toString() ?? '0.00000000';
    const feeCurrency = transaction.feeCurrency ?? currency;

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
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.FEE_REVENUE,
          direction: LedgerDirection.DEBIT,
          amount: feeAmount,
          currency: feeCurrency,
        },
        {
          transactionId: transaction.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.CREDIT,
          amount: feeAmount,
          currency: feeCurrency,
        },
      ];
    }

    throw new BadRequestException(`Unsupported transaction type: ${transaction.type}`);
  }
}