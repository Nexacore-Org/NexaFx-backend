import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import * as fastCsv from 'fast-csv';
import * as PDFDocument from 'pdfkit';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transactions/entities/transaction.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import {
  ReportExportJob,
  ExportJobStatus,
  ExportFormat,
} from './entities/report-export-job.entity';

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface MonthlySummary {
  totalSent: number;
  totalReceived: number;
  netFlow: number;
  currency: string;
  breakdown: CategoryBreakdown[];
  topTransactions: any[];
}

export interface TrendDataPoint {
  month: string;
  sent: number;
  received: number;
  net: number;
}

export interface BalanceDataPoint {
  date: string;
  balances: Record<string, number>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  private readonly SYSTEM_CATEGORIES = [
    { name: 'Transfers', icon: '↗️', color: '#3b82f6' },
    { name: 'Exchange', icon: '🔄', color: '#8b5cf6' },
    { name: 'Savings', icon: '🏦', color: '#10b981' },
    { name: 'Fees', icon: '💸', color: '#ef4444' },
    { name: 'Referral Rewards', icon: '🎁', color: '#f59e0b' },
    { name: 'Escrow', icon: '🔒', color: '#6366f1' },
    { name: 'Payroll', icon: '📋', color: '#14b8a6' },
    { name: 'Other', icon: '📦', color: '#6b7280' },
  ];

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(TransactionCategory)
    private readonly categoryRepository: Repository<TransactionCategory>,
    @InjectRepository(BalanceSnapshot)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshot>,
    @InjectRepository(ReportExportJob)
    private readonly exportJobRepository: Repository<ReportExportJob>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly usersService: UsersService,
  ) {}

  async getSystemCategories(): Promise<TransactionCategory[]> {
    return this.categoryRepository.find({ where: { isSystem: true } });
  }

  async getCategories(userId: string): Promise<TransactionCategory[]> {
    return this.categoryRepository.find({
      where: [{ isSystem: true }, { userId }],
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  async createCategory(
    userId: string,
    data: { name: string; icon?: string; color?: string },
  ): Promise<TransactionCategory> {
    const category = this.categoryRepository.create({
      name: data.name,
      icon: data.icon || '📦',
      color: data.color || '#6366f1',
      isSystem: false,
      userId,
    });
    return this.categoryRepository.save(category);
  }

  async assignCategory(
    transactionId: string,
    userId: string,
    categoryId: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    if (transaction.userId !== userId) {
      throw new ForbiddenException('You do not own this transaction');
    }

    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (!category.isSystem && category.userId !== userId) {
      throw new ForbiddenException('You do not own this category');
    }

    transaction.metadata = { ...(transaction.metadata || {}), categoryId };
    return this.transactionRepository.save(transaction);
  }

  async getMonthlySummary(
    userId: string,
    year: number,
    month: number,
  ): Promise<MonthlySummary> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        createdAt: Between(startDate, endDate),
      },
    });

    if (transactions.length === 0) {
      return {
        totalSent: 0,
        totalReceived: 0,
        netFlow: 0,
        currency: 'USD',
        breakdown: [],
        topTransactions: [],
      };
    }

    const currency = await this.resolveCurrency(transactions);
    const converted = await this.convertAllToCurrency(transactions, currency);

    const sentTxs = transactions.filter(
      (t) =>
        t.type === TransactionType.WITHDRAW &&
        t.status === TransactionStatus.SUCCESS,
    );
    const receivedTxs = transactions.filter(
      (t) =>
        t.type === TransactionType.DEPOSIT &&
        t.status === TransactionStatus.SUCCESS,
    );

    const totalSent = sentTxs.reduce(
      (sum, t) => sum + this.getConvertedAmount(t, converted),
      0,
    );
    const totalReceived = receivedTxs.reduce(
      (sum, t) => sum + this.getConvertedAmount(t, converted),
      0,
    );

    const categories = await this.categoryRepository.find();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const categoryBuckets = new Map<
      string,
      { amount: number; count: number }
    >();
    for (const tx of transactions) {
      if (tx.status !== TransactionStatus.SUCCESS) continue;
      const catId = tx.metadata?.categoryId || null;
      const bucket = categoryBuckets.get(catId) || { amount: 0, count: 0 };
      bucket.amount += this.getConvertedAmount(tx, converted);
      bucket.count += 1;
      categoryBuckets.set(catId, bucket);
    }

    const totalSuccessAmount = Array.from(categoryBuckets.values()).reduce(
      (s, b) => s + b.amount,
      0,
    );

    const breakdown: CategoryBreakdown[] = Array.from(categoryBuckets.entries())
      .map(([catId, { amount, count }]) => {
        const cat = catId ? categoryMap.get(catId) : null;
        return {
          categoryId: catId || 'uncategorized',
          categoryName: cat?.name || 'Uncategorized',
          icon: cat?.icon || '📦',
          color: cat?.color || '#9ca3af',
          amount,
          count,
          percentage:
            totalSuccessAmount > 0 ? (amount / totalSuccessAmount) * 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const topTransactions = transactions
      .filter((t) => t.status === TransactionStatus.SUCCESS)
      .sort(
        (a, b) =>
          this.getConvertedAmount(b, converted) -
          this.getConvertedAmount(a, converted),
      )
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        convertedAmount: this.getConvertedAmount(t, converted),
        convertedCurrency: currency,
        status: t.status,
        createdAt: t.createdAt,
        category: t.metadata?.categoryId
          ? categoryMap.get(t.metadata.categoryId)?.name || 'Uncategorized'
          : 'Uncategorized',
      }));

    return {
      totalSent,
      totalReceived,
      netFlow: totalReceived - totalSent,
      currency,
      breakdown,
      topTransactions,
    };
  }

  async getTrends(userId: string, months: number): Promise<TrendDataPoint[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        createdAt: Between(startDate, endDate),
      },
    });

    const currency = await this.resolveCurrency(transactions);
    const converted = await this.convertAllToCurrency(transactions, currency);

    const monthBuckets = new Map<string, { sent: number; received: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets.set(key, { sent: 0, received: 0 });
    }

    for (const tx of transactions) {
      if (tx.status !== TransactionStatus.SUCCESS) continue;
      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = monthBuckets.get(key);
      if (!bucket) continue;

      const amount = this.getConvertedAmount(tx, converted);
      if (
        tx.type === TransactionType.WITHDRAW ||
        tx.type === TransactionType.SWAP
      ) {
        bucket.sent += amount;
      } else if (tx.type === TransactionType.DEPOSIT) {
        bucket.received += amount;
      }
    }

    return Array.from(monthBuckets.entries())
      .map(([month, { sent, received }]) => ({
        month,
        sent,
        received,
        net: received - sent,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async getBalanceHistory(
    userId: string,
    days: number,
  ): Promise<BalanceDataPoint[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await this.balanceSnapshotRepository.find({
      where: {
        userId,
        snapshotDate: MoreThanOrEqual(startDate.toISOString().split('T')[0]),
      },
      order: { snapshotDate: 'ASC' },
    });

    return snapshots.map((s) => ({
      date: s.snapshotDate,
      balances: s.balances,
    }));
  }

  async recordBalanceSnapshot(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const existing = await this.balanceSnapshotRepository.findOne({
      where: { userId, snapshotDate: today },
    });
    if (existing) return;

    const snapshot = this.balanceSnapshotRepository.create({
      userId,
      balances: user.balances || {},
      snapshotDate: today,
    });
    await this.balanceSnapshotRepository.save(snapshot);
  }

  async recordBalanceSnapshotsForAllUsers(): Promise<number> {
    const users = await this.userRepository.find({ select: ['id'] });
    let count = 0;
    for (const user of users) {
      try {
        await this.recordBalanceSnapshot(user.id);
        count++;
      } catch (err) {
        this.logger.error(
          `Failed to record balance snapshot for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return count;
  }

  async createExportJob(
    userId: string,
    format: 'csv' | 'pdf',
    from: string,
    to: string,
  ): Promise<ReportExportJob> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO 8601.');
    }

    const job = this.exportJobRepository.create({
      userId,
      format:
        format.toUpperCase() === 'PDF' ? ExportFormat.PDF : ExportFormat.CSV,
      fromDate,
      toDate,
      status: ExportJobStatus.PENDING,
    });
    const saved = await this.exportJobRepository.save(job);

    this.processExportJob(saved).catch((err) =>
      this.logger.error(`Export job ${saved.id} failed: ${err.message}`),
    );

    return saved;
  }

  private async processExportJob(job: ReportExportJob): Promise<void> {
    await this.exportJobRepository.update(job.id, {
      status: ExportJobStatus.PROCESSING,
    });

    try {
      const transactions = await this.transactionRepository.find({
        where: {
          userId: job.userId,
          createdAt: Between(job.fromDate, job.toDate),
        },
        order: { createdAt: 'ASC' },
      });

      const categories = await this.categoryRepository.find();
      const categoryMap = new Map(categories.map((c) => [c.id, c]));

      let buffer: Buffer;
      let filename: string;
      let recordCount: number;

      if (job.format === ExportFormat.CSV) {
        const result = await this.generateCsv(transactions, categoryMap);
        buffer = result.buffer;
        recordCount = result.count;
        filename = `report-${job.id.slice(0, 8)}.csv`;
      } else {
        const result = await this.generatePdf(
          transactions,
          categoryMap,
          job.fromDate,
          job.toDate,
        );
        buffer = result.buffer;
        recordCount = result.count;
        filename = `report-${job.id.slice(0, 8)}.pdf`;
      }

      await this.exportJobRepository.update(job.id, {
        status: ExportJobStatus.COMPLETED,
        filename,
        fileSize: buffer.length,
        recordCount,
        completedAt: new Date(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.exportJobRepository.update(job.id, {
        status: ExportJobStatus.FAILED,
        errorMessage: message,
      });
    }
  }

  private async generateCsv(
    transactions: Transaction[],
    categoryMap: Map<string, TransactionCategory>,
  ): Promise<{ buffer: Buffer; count: number }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const csvStream = fastCsv.format({ headers: true });

      csvStream.on('data', (chunk) => chunks.push(chunk));
      csvStream.on('end', () => {
        resolve({ buffer: Buffer.concat(chunks), count: transactions.length });
      });
      csvStream.on('error', reject);

      for (const tx of transactions) {
        const catId = tx.metadata?.categoryId;
        const cat = catId ? categoryMap.get(catId) : null;
        csvStream.write({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          status: tx.status,
          category: cat?.name || 'Uncategorized',
          categoryIcon: cat?.icon || '',
          counterparty: tx.metadata?.counterparty || '',
          date: tx.createdAt.toISOString(),
          txHash: tx.txHash || '',
          fee: tx.feeAmount || '0',
        });
      }
      csvStream.end();
    });
  }

  private async generatePdf(
    transactions: Transaction[],
    categoryMap: Map<string, TransactionCategory>,
    fromDate: Date,
    toDate: Date,
  ): Promise<{ buffer: Buffer; count: number }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve({ buffer: Buffer.concat(chunks), count: transactions.length });
      });
      doc.on('error', reject);

      doc.fontSize(20).text('NexaFX Spending Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(12)
        .text(
          `Period: ${fromDate.toLocaleDateString()} - ${toDate.toLocaleDateString()}`,
          { align: 'center' },
        );
      doc.moveDown();

      const successful = transactions.filter(
        (t) => t.status === TransactionStatus.SUCCESS,
      );
      const deposits = successful.filter(
        (t) => t.type === TransactionType.DEPOSIT,
      );
      const withdrawals = successful.filter(
        (t) => t.type === TransactionType.WITHDRAW,
      );

      const totalDeposits = deposits.reduce(
        (s, t) => s + parseFloat(t.amount),
        0,
      );
      const totalWithdrawals = withdrawals.reduce(
        (s, t) => s + parseFloat(t.amount),
        0,
      );

      doc.fontSize(14).text('Monthly Summary', { underline: true });
      doc.fontSize(10);
      doc.text(`Total Received: ${totalDeposits.toFixed(2)}`);
      doc.text(`Total Sent: ${totalWithdrawals.toFixed(2)}`);
      doc.text(`Net Flow: ${(totalDeposits - totalWithdrawals).toFixed(2)}`);
      doc.moveDown();

      const categoryBuckets = new Map<
        string,
        { amount: number; count: number }
      >();
      for (const tx of successful) {
        const catId = tx.metadata?.categoryId || 'uncategorized';
        const b = categoryBuckets.get(catId) || { amount: 0, count: 0 };
        b.amount += parseFloat(tx.amount);
        b.count += 1;
        categoryBuckets.set(catId, b);
      }

      doc.fontSize(14).text('Category Breakdown', { underline: true });
      const totalAmount = Array.from(categoryBuckets.values()).reduce(
        (s, b) => s + b.amount,
        0,
      );

      let y = doc.y;
      for (const [catId, { amount, count }] of categoryBuckets) {
        const cat = categoryMap.get(catId === 'uncategorized' ? '' : catId);
        const name = cat?.name || 'Uncategorized';
        const pct =
          totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : '0';
        doc
          .fontSize(10)
          .text(
            `${name}: ${amount.toFixed(2)} (${pct}%) - ${count} tx(s)`,
            50,
            y,
          );
        y += 18;
      }
      doc.moveDown();

      doc.fontSize(14).text('Transaction Details', { underline: true });
      doc.fontSize(8);
      let ty = doc.y;
      for (const tx of transactions) {
        const catId = tx.metadata?.categoryId;
        const cat = catId ? categoryMap.get(catId) : null;
        if (ty > 720) {
          doc.addPage();
          ty = 50;
        }
        doc.text(
          `${tx.createdAt.toLocaleDateString()} | ${tx.type} | ${tx.amount} ${tx.currency} | ${tx.status} | ${cat?.name || 'Uncategorized'}`,
          50,
          ty,
        );
        ty += 14;
      }

      doc.fontSize(8).text('Generated by NexaFX', { align: 'center' });
      doc.end();
    });
  }

  private async resolveCurrency(transactions: Transaction[]): Promise<string> {
    const currencySet = new Set(transactions.map((t) => t.currency));
    if (currencySet.has('USD')) return 'USD';
    if (currencySet.has('USDC')) return 'USDC';
    return currencySet.values().next().value || 'USD';
  }

  private async convertAllToCurrency(
    transactions: Transaction[],
    targetCurrency: string,
  ): Promise<Map<string, number>> {
    const rates = new Map<string, number>();
    const currencies = new Set(transactions.map((t) => t.currency));
    for (const curr of currencies) {
      if (curr === targetCurrency) {
        rates.set(curr, 1);
      } else {
        try {
          const rate = await this.exchangeRatesService.convert(
            curr,
            targetCurrency,
            1,
          );
          rates.set(curr, rate.rate);
        } catch {
          rates.set(curr, 1);
        }
      }
    }
    return rates;
  }

  private getConvertedAmount(
    tx: Transaction,
    rates: Map<string, number>,
  ): number {
    const rate = rates.get(tx.currency) || 1;
    return parseFloat(tx.amount) * rate;
  }

  autoAssignCategory(txType: TransactionType, metadata?: any): string | null {
    switch (txType) {
      case TransactionType.SWAP:
        return 'Exchange';
      case TransactionType.WITHDRAW:
        return 'Transfers';
      case TransactionType.DEPOSIT: {
        if (metadata?.source === 'batch' || metadata?.batchPayment) {
          return 'Payroll';
        }
        if (metadata?.source === 'referral') {
          return 'Referral Rewards';
        }
        if (metadata?.source === 'savings') {
          return 'Savings';
        }
        return 'Transfers';
      }
      default:
        return 'Other';
    }
  }

  async resolveCategoryByName(name: string): Promise<string | null> {
    const cat = await this.categoryRepository.findOne({
      where: { name, isSystem: true },
    });
    return cat?.id || null;
  }

  async getExportJob(jobId: string, userId: string): Promise<ReportExportJob> {
    const job = await this.exportJobRepository.findOne({
      where: { id: jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('Export job not found');
    }
    return job;
  }
}
