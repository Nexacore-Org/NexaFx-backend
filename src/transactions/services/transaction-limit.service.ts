import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { User, UserKycTier } from '../../users/user.entity';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';

interface UsageSummary {
  todayUsd: number;
  monthUsd: number;
}

@Injectable()
export class TransactionLimitService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(TransactionLimit)
    private readonly transactionLimitRepository: Repository<TransactionLimit>,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async ensureDefaultLimits(): Promise<void> {
    const defaults: Array<{
      tier: UserKycTier;
      dailyLimitUsd: string;
      monthlyLimitUsd: string;
      singleTxLimitUsd: string;
    }> = [
      {
        tier: UserKycTier.UNVERIFIED,
        dailyLimitUsd: '100',
        monthlyLimitUsd: '1000',
        singleTxLimitUsd: '100',
      },
      {
        tier: UserKycTier.BASIC,
        dailyLimitUsd: '1000',
        monthlyLimitUsd: '15000',
        singleTxLimitUsd: '1000',
      },
      {
        tier: UserKycTier.ENHANCED,
        dailyLimitUsd: '10000',
        monthlyLimitUsd: '150000',
        singleTxLimitUsd: '10000',
      },
      {
        tier: UserKycTier.FULL,
        dailyLimitUsd: '50000',
        monthlyLimitUsd: '500000',
        singleTxLimitUsd: '50000',
      },
    ];

    for (const row of defaults) {
      const existing = await this.transactionLimitRepository.findOne({
        where: { tier: row.tier },
      });
      if (!existing) {
        await this.transactionLimitRepository.save(
          this.transactionLimitRepository.create(row),
        );
      }
    }
  }

  async listLimits(): Promise<TransactionLimit[]> {
    await this.ensureDefaultLimits();
    return this.transactionLimitRepository.find({ order: { tier: 'ASC' } });
  }

  async upsertLimit(
    tier: UserKycTier,
    data: {
      dailyLimitUsd: number;
      monthlyLimitUsd: number;
      singleTxLimitUsd: number;
    },
  ): Promise<TransactionLimit> {
    if (
      data.dailyLimitUsd < 0 ||
      data.monthlyLimitUsd < 0 ||
      data.singleTxLimitUsd < 0
    ) {
      throw new BadRequestException(
        'Limit values must be greater than or equal to 0',
      );
    }

    await this.ensureDefaultLimits();

    const existing = await this.transactionLimitRepository.findOne({
      where: { tier },
    });
    if (!existing) {
      return this.transactionLimitRepository.save(
        this.transactionLimitRepository.create({
          tier,
          dailyLimitUsd: data.dailyLimitUsd.toFixed(8),
          monthlyLimitUsd: data.monthlyLimitUsd.toFixed(8),
          singleTxLimitUsd: data.singleTxLimitUsd.toFixed(8),
        }),
      );
    }

    existing.dailyLimitUsd = data.dailyLimitUsd.toFixed(8);
    existing.monthlyLimitUsd = data.monthlyLimitUsd.toFixed(8);
    existing.singleTxLimitUsd = data.singleTxLimitUsd.toFixed(8);
    return this.transactionLimitRepository.save(existing);
  }

  async check(userId: string, amount: number, currency: string): Promise<void> {
    const status = await this.getUserLimitStatus(userId);
    const amountUsd = await this.convertToUsd(currency, amount);

    const singleTxLimit = Number(status.limits.singleTxLimitUsd);
    if (amountUsd > singleTxLimit) {
      throw new UnprocessableEntityException({
        code: 'SINGLE_TX_LIMIT_EXCEEDED',
        message: 'Single transaction limit exceeded for your KYC tier',
        remainingAllowance: Math.max(singleTxLimit, 0),
      });
    }

    const dailyLimit = Number(status.limits.dailyLimitUsd);
    const dailyRemaining = Math.max(dailyLimit - status.usage.todayUsd, 0);
    if (amountUsd > dailyRemaining) {
      throw new UnprocessableEntityException({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: 'Daily transaction limit exceeded for your KYC tier',
        remainingAllowance: Number(dailyRemaining.toFixed(8)),
      });
    }

    const monthlyLimit = Number(status.limits.monthlyLimitUsd);
    const monthlyRemaining = Math.max(monthlyLimit - status.usage.monthUsd, 0);
    if (amountUsd > monthlyRemaining) {
      throw new UnprocessableEntityException({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        message: 'Monthly transaction limit exceeded for your KYC tier',
        remainingAllowance: Number(monthlyRemaining.toFixed(8)),
      });
    }
  }

  async getUserLimitStatus(userId: string): Promise<{
    tier: UserKycTier;
    limits: {
      dailyLimitUsd: number;
      monthlyLimitUsd: number;
      singleTxLimitUsd: number;
    };
    usage: UsageSummary;
    remaining: {
      dailyUsd: number;
      monthlyUsd: number;
    };
  }> {
    await this.ensureDefaultLimits();

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const limit = await this.transactionLimitRepository.findOne({
      where: { tier: user.kycTier },
    });

    if (!limit) {
      throw new NotFoundException('Transaction limit configuration not found');
    }

    const usage = await this.getUsageInUsd(userId);
    const dailyLimit = Number(limit.dailyLimitUsd);
    const monthlyLimit = Number(limit.monthlyLimitUsd);

    return {
      tier: user.kycTier,
      limits: {
        dailyLimitUsd: dailyLimit,
        monthlyLimitUsd: monthlyLimit,
        singleTxLimitUsd: Number(limit.singleTxLimitUsd),
      },
      usage,
      remaining: {
        dailyUsd: Number(Math.max(dailyLimit - usage.todayUsd, 0).toFixed(8)),
        monthlyUsd: Number(
          Math.max(monthlyLimit - usage.monthUsd, 0).toFixed(8),
        ),
      },
    };
  }

  private async getUsageInUsd(userId: string): Promise<UsageSummary> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [dayRows, monthRows] = await Promise.all([
      this.transactionRepository
        .createQueryBuilder('t')
        .select('t.currency', 'currency')
        .addSelect('SUM(CAST(t.amount AS DECIMAL))', 'total')
        .where('t.userId = :userId', { userId })
        .andWhere('t.status IN (:...statuses)', {
          statuses: [TransactionStatus.PENDING, TransactionStatus.SUCCESS],
        })
        .andWhere('t.createdAt >= :dayStart', { dayStart })
        .groupBy('t.currency')
        .getRawMany<{ currency: string; total: string }>(),
      this.transactionRepository
        .createQueryBuilder('t')
        .select('t.currency', 'currency')
        .addSelect('SUM(CAST(t.amount AS DECIMAL))', 'total')
        .where('t.userId = :userId', { userId })
        .andWhere('t.status IN (:...statuses)', {
          statuses: [TransactionStatus.PENDING, TransactionStatus.SUCCESS],
        })
        .andWhere('t.createdAt >= :monthStart', { monthStart })
        .groupBy('t.currency')
        .getRawMany<{ currency: string; total: string }>(),
    ]);

    const todayUsd = await this.convertRowsToUsd(dayRows);
    const monthUsd = await this.convertRowsToUsd(monthRows);

    return {
      todayUsd: Number(todayUsd.toFixed(8)),
      monthUsd: Number(monthUsd.toFixed(8)),
    };
  }

  private async convertRowsToUsd(
    rows: Array<{ currency: string; total: string }>,
  ): Promise<number> {
    let sumUsd = 0;
    for (const row of rows) {
      const amount = Number(row.total ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      sumUsd += await this.convertToUsd(row.currency, amount);
    }
    return sumUsd;
  }

  private async convertToUsd(
    currency: string,
    amount: number,
  ): Promise<number> {
    const normalizedCurrency = currency.toUpperCase();
    if (normalizedCurrency === 'USD') {
      return amount;
    }

    const rate = await this.exchangeRatesService.getRate(
      normalizedCurrency,
      'USD',
    );
    return amount * rate.rate;
  }
}
