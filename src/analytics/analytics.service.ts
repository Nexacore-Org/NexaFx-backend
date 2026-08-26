import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Transaction, TransactionType } from '../../transactions/entities/transaction.entity';
import {
  TransactionCategory,
  TransactionCategoryColor,
} from '../entities/transaction-category.entity';
import { BalanceSnapshot } from '../entities/balance-snapshot.entity';
import { ReportExportJob, ExportJobStatus, ExportFormat } from '../entities/report-export-job.entity';
import { SummaryQueryDto } from '../dto/summary-query.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { AssignCategoryDto } from '../dto/assign-category.dto';
import Decimal from 'decimal.js';

export interface CategorySummary {
  categoryId: string;
  categoryName: string;
  color: string | null;
  totalAmount: string;
  transactionCount: number;
}

export interface DailySummary {
  date: string;
  totalAmount: string;
  transactionCount: number;
}

export interface SpendingSummary {
  categories: CategorySummary[];
  daily: DailySummary[];
  totalAmount: string;
  totalTransactionCount: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('AnalyticsService');

  constructor(
    @InjectRepository(TransactionCategory)
    private readonly categoryRepository: Repository<TransactionCategory>,
    @InjectRepository(BalanceSnapshot)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshot>,
    @InjectRepository(ReportExportJob)
    private readonly exportJobRepository: Repository<ReportExportJob>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
  ) {}

  async getSpendingSummary(userId: string, query: SummaryQueryDto): Promise<SpendingSummary> {
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const qb = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.createdAt >= :startDate', { startDate })
      .andWhere('transaction.createdAt <= :endDate', { endDate })
      .andWhere('transaction.status = :status', { status: 'SUCCESS' });

    if (query.categoryId) {
      qb.andWhere('transaction.metadata->>categoryId = :categoryId', { categoryId: query.categoryId });
    }

    const categorySummaryQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(transaction_category.name, Uncategorised)', 'categoryName')
      .addSelect('transaction_category.id', 'categoryId')
      .addSelect('COALESCE(transaction_category.color, NULL)', 'color')
      .addSelect('SUM(CAST(transaction.amount AS DECIMAL)), 'totalAmount')
      .addSelect('COUNT(transaction.id)', 'transactionCount')
      .from('transactions', 'transaction')
      .leftJoin('transaction_categories', 'transaction_category', 'transaction.metadata->>categoryId = transaction_category.id')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.createdAt >= :startDate', { startDate })
      .andWhere('transaction.createdAt <= :endDate', { endDate })
      .andWhere('transaction.status = :status', { status: 'SUCCESS' })
      .groupBy('transaction_category.id, transaction_category.name, transaction_category.color')
      .orderBy('totalAmount', 'DESC');

    if (query.categoryId) {
      categorySummaryQb.andWhere('transaction.metadata->>categoryId = :categoryId', { categoryId: query.categoryId });
    }

    const categoryResults = await categorySummaryQb.getRawMany();

    const dailySummaryQb = this.dataSource
      .createQueryBuilder()
      .select('DATE(transaction.createdAt)', 'date')
      .addSelect('SUM(CAST(transaction.amount AS DECIMAL)), 'totalAmount')
      .addSelect('COUNT(transaction.id)', 'transactionCount')
      .from('transactions', 'transaction')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.createdAt >= :startDate', { startDate })
      .andWhere('transaction.createdAt <= :endDate', { endDate })
      .andWhere('transaction.status = :status', { status: 'SUCCESS' })
      .groupBy('DATE(transaction.createdAt)')
      .orderBy('DATE(transaction.createdAt)', 'ASC');

    if (query.categoryId) {
      dailySummaryQb.andWhere('transaction.metadata->>categoryId = :categoryId', { categoryId: query.categoryId });
    }

    const dailyResults = await dailySummaryQb.getRawMany();

    const totalAmount = new Decimal(0);
    const categories: CategorySummary[] = categoryResults.map((row) => {
      const amount = new Decimal(row.totalAmount || 0);
      totalAmount.add(amount);
      return {
        categoryId: row.categoryId || '',
        categoryName: row.categoryName || 'Uncategorised',
        color: row.color,
        totalAmount: amount.toFixed(8),
        transactionCount: parseInt(row.transactionCount, 10),
      };
    });

    const daily: DailySummary[] = dailyResults.map((row) => ({
      date: row.date,
      totalAmount: new Decimal(row.totalAmount || 0).toFixed(8),
      transactionCount: parseInt(row.transactionCount, 10),
    }));

    return {
      categories,
      daily,
      totalAmount: totalAmount.toFixed(8),
      totalTransactionCount: categories.reduce((sum, cat) => sum + cat.transactionCount, 0),
    };
  }

  async createCategory(userId: string, dto: CreateCategoryDto): Promise<TransactionCategory> {
    const existing = await this.categoryRepository.findOne({
      where: { userId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Category with name '${dto.name}' already exists`);
    }

    const category = this.categoryRepository.create({
      userId,
      name: dto.name,
      color: dto.color || TransactionCategoryColor.GRAY,
    });

    const saved = await this.categoryRepository.save(category);
    this.logger.log(`Created category ${saved.id} for user ${userId}`);
    return saved;
  }

  async findUserCategories(userId: string): Promise<TransactionCategory[]> {
    return this.categoryRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async assignCategory(userId: string, dto: AssignCategoryDto): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: dto.transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${dto.transactionId} not found`);
    }

    if (transaction.userId !== userId) {
      throw new BadRequestException('Transaction does not belong to the current user');
    }

    const category = await this.categoryRepository.findOne({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category ${dto.categoryId} not found`);
    }

    if (category.userId !== userId) {
      throw new BadRequestException('Category does not belong to the current user');
    }

    transaction.metadata = {
      ...(transaction.metadata ?? {}),
      categoryId: dto.categoryId,
    };

    const updated = await this.transactionRepository.save(transaction);
    this.logger.log(`Assigned category ${dto.categoryId} to transaction ${dto.transactionId}`);
    return updated;
  }

  async createExportJob(userId: string, format: ExportFormat): Promise<ReportExportJob> {
    const job = this.exportJobRepository.create({
      userId,
      format,
      status: ExportJobStatus.PENDING,
    });

    const saved = await this.exportJobRepository.save(job);
    this.logger.log(`Created export job ${saved.id} for user ${userId}`);
    return saved;
  }

  async getUserBalanceSnapshots(userId: string): Promise<BalanceSnapshot[]> {
    return this.balanceSnapshotRepository.find({
      where: { userId },
      order: { snapshotDate: 'DESC' },
      take: 90,
    });
  }

  async recordBalanceSnapshot(userId: string, balance: string, currency: string): Promise<BalanceSnapshot> {
    const snapshot = this.balanceSnapshotRepository.create({
      userId,
      balance,
      currency,
      snapshotDate: new Date(),
    });

    return this.balanceSnapshotRepository.save(snapshot);
  }
}
