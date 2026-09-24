import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { Statement } from './entities/statement.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { WalletsService } from '../../wallets/wallets.service';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';

export interface StatementSummary {
  openingBalance: string;
  closingBalance: string;
  totalCredits: string;
  totalDebits: string;
  totalFees: string;
  transactionCount: number;
}

export interface StatementRow {
  date: string;
  description: string;
  type: string;
  debit: string | null;
  credit: string | null;
  runningBalance: string;
  txHash: string | null;
}

export interface StatementDetail extends StatementSummary {
  id: string;
  currency: string;
  year: number;
  month: number;
  transactions: StatementRow[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class StatementService {
  private readonly logger = new Logger(StatementService.name);

  constructor(
    @InjectRepository(Statement)
    private readonly statementRepository: Repository<Statement>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async generate(
    userId: string,
    currency: string,
    year: number,
    month: number,
  ): Promise<Statement> {
    const existing = await this.statementRepository.findOne({
      where: { userId, currency, year, month },
    });
    if (existing) return existing;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        currency,
        status: TransactionStatus.SUCCESS,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
    });

    const openingBalance = await this.calculateOpeningBalance(
      userId,
      currency,
      year,
      month,
    );

    let runningBalance = parseFloat(openingBalance);
    let totalCredits = 0;
    let totalDebits = 0;
    let totalFees = 0;

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount);
      const fee = parseFloat(tx.feeAmount ?? '0');
      totalFees += fee;

      if (
        tx.type === TransactionType.DEPOSIT ||
        tx.type === TransactionType.LOAN_DISBURSEMENT
      ) {
        totalCredits += amount;
        runningBalance += amount;
      } else if (
        tx.type === TransactionType.WITHDRAW ||
        tx.type === TransactionType.LOAN_REPAYMENT
      ) {
        totalDebits += amount;
        runningBalance -= amount;
      }
    }

    const closingBalance = runningBalance.toFixed(8);

    const statement = this.statementRepository.create({
      userId,
      currency,
      year,
      month,
      openingBalance,
      closingBalance,
      totalCredits: totalCredits.toFixed(8),
      totalDebits: totalDebits.toFixed(8),
      totalFees: totalFees.toFixed(8),
      transactionCount: transactions.length,
    });

    return this.statementRepository.save(statement);
  }

  async getStatementDetail(
    userId: string,
    year: number,
    month: number,
    currency: string,
  ): Promise<StatementDetail> {
    let statement = await this.statementRepository.findOne({
      where: { userId, currency, year, month },
    });

    if (!statement) {
      statement = await this.generate(userId, currency, year, month);
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        currency,
        status: TransactionStatus.SUCCESS,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
    });

    let runningBalance = parseFloat(statement.openingBalance);

    const rows: StatementRow[] = transactions.map((tx) => {
      const amount = parseFloat(tx.amount);
      let debit: string | null = null;
      let credit: string | null = null;

      if (
        tx.type === TransactionType.DEPOSIT ||
        tx.type === TransactionType.LOAN_DISBURSEMENT
      ) {
        credit = amount.toFixed(8);
        runningBalance += amount;
      } else if (
        tx.type === TransactionType.WITHDRAW ||
        tx.type === TransactionType.LOAN_REPAYMENT
      ) {
        debit = amount.toFixed(8);
        runningBalance -= amount;
      }

      return {
        date: tx.createdAt.toISOString(),
        description: this.describeTransaction(tx),
        type: tx.type,
        debit,
        credit,
        runningBalance: runningBalance.toFixed(8),
        txHash: tx.txHash ?? tx.stellarTxHash ?? null,
      };
    });

    return {
      id: statement.id,
      currency: statement.currency,
      year: statement.year,
      month: statement.month,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      totalCredits: statement.totalCredits,
      totalDebits: statement.totalDebits,
      totalFees: statement.totalFees,
      transactionCount: statement.transactionCount,
      transactions: rows,
    };
  }

  async listStatements(userId: string): Promise<Statement[]> {
    return this.statementRepository.find({
      where: { userId },
      order: { year: 'DESC', month: 'DESC', currency: 'ASC' },
    });
  }

  async generateForAllActiveUsers(year: number, month: number): Promise<void> {
    const activeCurrencyStats = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t."userId"', 'userId')
      .addSelect('t.currency', 'currency')
      .where('t.status = :status', { status: TransactionStatus.SUCCESS })
      .andWhere('t."createdAt" >= :start', {
        start: new Date(year, month - 1, 1),
      })
      .andWhere('t."createdAt" <= :end', {
        end: new Date(year, month, 0, 23, 59, 59),
      })
      .groupBy('t."userId"')
      .addGroupBy('t.currency')
      .getRawMany();

    for (const row of activeCurrencyStats) {
      try {
        const statement = await this.generate(
          row.userId,
          row.currency,
          year,
          month,
        );

        await this.notificationsService.createAndSend(
          row.userId,
          {
            title: `${MONTH_NAMES[month - 1]} ${year} ${row.currency} Statement Ready`,
            body: `Your ${MONTH_NAMES[month - 1]} ${year} ${row.currency} account statement is now available.`,
            type: 'STATEMENT_READY' as any,
          },
        );
      } catch (error: unknown) {
        this.logger.error(
          `Failed to generate statement for user ${row.userId}, ${row.currency}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Generated ${activeCurrencyStats.length} statements for ${MONTH_NAMES[month - 1]} ${year}`,
    );
  }

  generatePDFContent(detail: StatementDetail): string {
    const lines: string[] = [];
    const monthName = MONTH_NAMES[detail.month - 1];

    lines.push('='.repeat(60));
    lines.push('                    NexaFX Account Statement');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`  Period: ${monthName} ${detail.year}`);
    lines.push(`  Currency: ${detail.currency}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('  SUMMARY');
    lines.push('-'.repeat(60));
    lines.push(`  Opening Balance:    ${detail.openingBalance} ${detail.currency}`);
    lines.push(`  Total Credits:      +${detail.totalCredits} ${detail.currency}`);
    lines.push(`  Total Debits:       -${detail.totalDebits} ${detail.currency}`);
    lines.push(`  Total Fees:         -${detail.totalFees} ${detail.currency}`);
    lines.push(`  Closing Balance:    ${detail.closingBalance} ${detail.currency}`);
    lines.push(`  Transactions:       ${detail.transactionCount}`);
    lines.push('-'.repeat(60));
    lines.push('');
    lines.push('  TRANSACTIONS');
    lines.push('-'.repeat(60));
    lines.push(
      '  Date       | Description           | Debit        | Credit       | Balance',
    );
    lines.push('-'.repeat(60));

    for (const row of detail.transactions) {
      const date = row.date.substring(0, 10);
      const desc = (row.description || '').substring(0, 21).padEnd(21);
      const debit = (row.debit ?? '').padStart(12);
      const credit = (row.credit ?? '').padStart(12);
      const balance = row.runningBalance.padStart(12);
      lines.push(`  ${date} | ${desc} | ${debit} | ${credit} | ${balance}`);
    }

    lines.push('-'.repeat(60));
    lines.push('');
    lines.push('  This is an official NexaFX account statement.');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  generateCSVContent(detail: StatementDetail): string {
    const monthName = MONTH_NAMES[detail.month - 1];
    const rows: string[] = [];

    rows.push('NexaFX Account Statement');
    rows.push(`Period,${monthName} ${detail.year}`);
    rows.push(`Currency,${detail.currency}`);
    rows.push('');
    rows.push(
      'Date,Description,Type,Debit,Credit,Running Balance,Transaction Hash',
    );

    for (const tx of detail.transactions) {
      rows.push(
        [
          tx.date.substring(0, 10),
          `"${tx.description}"`,
          tx.type,
          tx.debit ?? '',
          tx.credit ?? '',
          tx.runningBalance,
          tx.txHash ?? '',
        ].join(','),
      );
    }

    rows.push('');
    rows.push(`Opening Balance,,,${detail.openingBalance},,`);
    rows.push(`Closing Balance,,,,,${detail.closingBalance}`);
    rows.push(`Total Credits,,,,+${detail.totalCredits},`);
    rows.push(`Total Debits,,${detail.totalDebits},,,`);
    rows.push(`Total Fees,,${detail.totalFees},,,`);

    return rows.join('\n');
  }

  private describeTransaction(tx: Transaction): string {
    const typeLabels: Record<string, string> = {
      [TransactionType.DEPOSIT]: 'Deposit',
      [TransactionType.WITHDRAW]: 'Withdrawal',
      [TransactionType.SWAP]: 'Currency Swap',
      [TransactionType.LOAN_DISBURSEMENT]: 'Loan Disbursement',
      [TransactionType.LOAN_REPAYMENT]: 'Loan Repayment',
    };
    return typeLabels[tx.type] ?? tx.type;
  }

  private async calculateOpeningBalance(
    userId: string,
    currency: string,
    year: number,
    month: number,
  ): Promise<string> {
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;

    const prevStatement = await this.statementRepository.findOne({
      where: {
        userId,
        currency,
        year: previousYear,
        month: previousMonth,
      },
    });

    if (prevStatement) {
      return prevStatement.closingBalance;
    }

    const wallets = await this.walletsService.findAllByUser(userId);
    const wallet = wallets.find((w) => w.currency === currency);

    if (wallet) {
      const currentBalance = parseFloat(wallet.balance);

      const startDate = new Date(year, month - 1, 1);
      const netChange = await this.transactionRepository
        .createQueryBuilder('t')
        .select(
          `COALESCE(SUM(CASE
            WHEN t.type IN ('DEPOSIT', 'LOAN_DISBURSEMENT') THEN CAST(t.amount AS numeric)
            WHEN t.type IN ('WITHDRAW', 'LOAN_REPAYMENT') THEN -CAST(t.amount AS numeric)
            ELSE 0
          END), 0)`,
          'netChange',
        )
        .where('t."userId" = :userId', { userId })
        .andWhere('t.currency = :currency', { currency })
        .andWhere('t.status = :status', { status: TransactionStatus.SUCCESS })
        .andWhere('t."createdAt" >= :start', { start: startDate })
        .getRawOne();

      const openingBalance =
        currentBalance - parseFloat(netChange?.netChange ?? '0');
      return openingBalance.toFixed(8);
    }

    return '0.00000000';
  }
}
