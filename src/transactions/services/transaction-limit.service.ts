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
import {
  Transaction,
  TransactionStatus,
} from '../entities/transaction.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';

interface UsageSummary {
  todayUsd: number;
  monthUsd: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  remaining: {
    daily: number;
    monthly: number;
  };
}

export interface LimitStatusResponse {
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

  /**
   * Get user's KYC tier
   */
  async getUserKycTier(userId: string): Promise<UserKycTier> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.kycTier;
  }

  /**
   * Check if transaction is allowed within limits
   */
  async checkLimit(
    userId: string,
    transactionType: string,
    amount: number,
    currency: string,
  ): Promise<LimitCheckResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // UNVERIFIED users cannot transact
    if (user.kycTier === UserKycTier.UNVERIFIED) {
      throw new UnprocessableEntityException({
        code: 'UNVERIFIED_USER_CANNOT_TRANSACT',
        message:
          'Unverified users cannot perform transactions. Please complete KYC verification.',
        allowed: false,
      });
    }

    // Get active limit config for this tier, transaction type, and currency
    const limit = await this.transactionLimitRepository.findOne({
      where: {
        tier: user.kycTier,
        transactionType,
        currency: 'USD',
        isActive: true,
      },
    });

    if (!limit) {
      throw new UnprocessableEntityException({
        code: 'LIMIT_CONFIG_NOT_FOUND',
        message: `No active limit configuration found for tier ${user.kycTier} and transaction type ${transactionType}`,
        allowed: false,
      });
    }

    // Convert amount to USD
    const amountUsd = await this.convertToUsd(currency, amount);

    // Check single transaction limit
    const singleMax = Number(limit.singleTransactionMax);
    if (amountUsd > singleMax && singleMax > 0) {
      throw new UnprocessableEntityException({
        code: 'SINGLE_TX_LIMIT_EXCEEDED',
        message: `Transaction amount exceeds single transaction limit of ${singleMax} USD`,
        allowed: false,
        limit: singleMax,
        amount: amountUsd,
      });
    }

    // Get usage summary
    const usage = await this.getUsageInUsd(userId, transactionType);

    // Check daily limit
    const dailyMax = Number(limit.dailyMax);
    const dailyRemaining = Math.max(dailyMax - usage.todayUsd, 0);
    if (amountUsd > dailyRemaining && dailyMax > 0) {
      throw new UnprocessableEntityException({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `Daily transaction limit exceeded. Remaining: ${dailyRemaining.toFixed(8)} USD`,
        allowed: false,
        remainingDaily: dailyRemaining,
      });
    }

    // Check monthly limit
    const monthlyMax = Number(limit.monthlyMax);
    const monthlyRemaining = Math.max(monthlyMax - usage.monthUsd, 0);
    if (amountUsd > monthlyRemaining && monthlyMax > 0) {
      throw new UnprocessableEntityException({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        message: `Monthly transaction limit exceeded. Remaining: ${monthlyRemaining.toFixed(8)} USD`,
        allowed: false,
        remainingMonthly: monthlyRemaining,
      });
    }

    return {
      allowed: true,
      remaining: {
        daily: Number(dailyRemaining.toFixed(8)),
        monthly: Number(monthlyRemaining.toFixed(8)),
      },
    };
  }

  /**
   * Backward compatible check method (legacy API)
   */
  async check(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const status = await this.getUserLimitStatus(userId);
    const amountUsd = await this.convertToUsd(currency, amount);

    const singleTxLimit = Number(status.limits.singleTxLimitUsd);
    if (amountUsd > singleTxLimit && singleTxLimit > 0) {
      throw new UnprocessableEntityException({
        code: 'SINGLE_TX_LIMIT_EXCEEDED',
        message: 'Single transaction limit exceeded for your KYC tier',
        remainingAllowance: Math.max(singleTxLimit, 0),
      });
    }

    const dailyLimit = Number(status.limits.dailyLimitUsd);
    const dailyRemaining = Math.max(dailyLimit - status.usage.todayUsd, 0);
    if (amountUsd > dailyRemaining && dailyLimit > 0) {
      throw new UnprocessableEntityException({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: 'Daily transaction limit exceeded for your KYC tier',
        remainingAllowance: Number(dailyRemaining.toFixed(8)),
      });
    }

    const monthlyLimit = Number(status.limits.monthlyLimitUsd);
    const monthlyRemaining = Math.max(monthlyLimit - status.usage.monthUsd, 0);
    if (amountUsd > monthlyRemaining && monthlyLimit > 0) {
      throw new UnprocessableEntityException({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        message: 'Monthly transaction limit exceeded for your KYC tier',
        remainingAllowance: Number(monthlyRemaining.toFixed(8)),
      });
    }
  }

  /**
   * List all active transaction limits
   */
  async listLimits(): Promise<TransactionLimit[]> {
    return this.transactionLimitRepository.find({
      where: { isActive: true },
      order: { tier: 'ASC', transactionType: 'ASC', currency: 'ASC' },
    });
  }

  /**
   * Get limit by ID
   */
  async getLimitById(id: string): Promise<TransactionLimit> {
    const limit = await this.transactionLimitRepository.findOne({
      where: { id },
    });
    if (!limit) {
      throw new NotFoundException(`Limit configuration with ID ${id} not found`);
    }
    return limit;
  }

  /**
   * Create or update a limit configuration
   */
  async upsertLimit(
    tier: UserKycTier,
    transactionType: string,
    currency: string,
    data: {
      singleTransactionMax: number;
      dailyMax: number;
      monthlyMax: number;
      isActive?: boolean;
    },
  ): Promise<TransactionLimit> {
    // Validation
    if (
      data.singleTransactionMax < 0 ||
      data.dailyMax < 0 ||
      data.monthlyMax < 0
    ) {
      throw new BadRequestException(
        'Limit values must be greater than or equal to 0',
      );
    }

    // Logical validation: daily should not be less than single (if both > 0)
    if (
      data.dailyMax > 0 &&
      data.singleTransactionMax > 0 &&
      data.dailyMax < data.singleTransactionMax
    ) {
      throw new BadRequestException(
        'Daily limit cannot be less than single transaction limit',
      );
    }

    // Logical validation: monthly should not be less than daily (if both > 0)
    if (
      data.monthlyMax > 0 &&
      data.dailyMax > 0 &&
      data.monthlyMax < data.dailyMax
    ) {
      throw new BadRequestException(
        'Monthly limit cannot be less than daily limit',
      );
    }

    const existing = await this.transactionLimitRepository.findOne({
      where: { tier, transactionType, currency },
    });

    if (existing) {
      existing.singleTransactionMax = data.singleTransactionMax.toFixed(8);
      existing.dailyMax = data.dailyMax.toFixed(8);
      existing.monthlyMax = data.monthlyMax.toFixed(8);
      if (data.isActive !== undefined) {
        existing.isActive = data.isActive;
      }
      return this.transactionLimitRepository.save(existing);
    }

    const newLimit = this.transactionLimitRepository.create({
      tier,
      transactionType,
      currency,
      singleTransactionMax: data.singleTransactionMax.toFixed(8),
      dailyMax: data.dailyMax.toFixed(8),
      monthlyMax: data.monthlyMax.toFixed(8),
      isActive: data.isActive !== false,
    });

    return this.transactionLimitRepository.save(newLimit);
  }

  /**
   * Update a limit configuration by ID
   */
  async updateLimit(
    id: string,
    data: {
      singleTransactionMax?: number;
      dailyMax?: number;
      monthlyMax?: number;
      isActive?: boolean;
    },
  ): Promise<TransactionLimit> {
    const limit = await this.getLimitById(id);

    if (data.singleTransactionMax !== undefined) {
      if (data.singleTransactionMax < 0) {
        throw new BadRequestException('singleTransactionMax cannot be negative');
      }
      limit.singleTransactionMax = data.singleTransactionMax.toFixed(8);
    }

    if (data.dailyMax !== undefined) {
      if (data.dailyMax < 0) {
        throw new BadRequestException('dailyMax cannot be negative');
      }
      limit.dailyMax = data.dailyMax.toFixed(8);
    }

    if (data.monthlyMax !== undefined) {
      if (data.monthlyMax < 0) {
        throw new BadRequestException('monthlyMax cannot be negative');
      }
      limit.monthlyMax = data.monthlyMax.toFixed(8);
    }

    if (data.isActive !== undefined) {
      limit.isActive = data.isActive;
    }

    // Validate relationships
    const dailyMax = Number(limit.dailyMax);
    const monthlyMax = Number(limit.monthlyMax);
    const singleMax = Number(limit.singleTransactionMax);

    if (dailyMax > 0 && singleMax > 0 && dailyMax < singleMax) {
      throw new BadRequestException(
        'Daily limit cannot be less than single transaction limit',
      );
    }

    if (monthlyMax > 0 && dailyMax > 0 && monthlyMax < dailyMax) {
      throw new BadRequestException(
        'Monthly limit cannot be less than daily limit',
      );
    }

    return this.transactionLimitRepository.save(limit);
  }

  /**
   * Get user's limit status
   */
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
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get default/generic limits for this tier (SEND is typical)
    const limit = await this.transactionLimitRepository.findOne({
      where: {
        tier: user.kycTier,
        transactionType: 'SEND',
        currency: 'USD',
        isActive: true,
      },
    });

    if (!limit) {
      throw new NotFoundException(
        `No limit configuration found for tier ${user.kycTier}`,
      );
    }

    const usage = await this.getUsageInUsd(userId, 'SEND');
    const dailyLimit = Number(limit.dailyMax);
    const monthlyLimit = Number(limit.monthlyMax);

    return {
      tier: user.kycTier,
      limits: {
        dailyLimitUsd: dailyLimit,
        monthlyLimitUsd: monthlyLimit,
        singleTxLimitUsd: Number(limit.singleTransactionMax),
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

  /**
   * Private: Calculate usage in USD for a transaction type
   */
  private async getUsageInUsd(
    userId: string,
    transactionType: string,
  ): Promise<UsageSummary> {
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
        .andWhere('t.type = :transactionType', {
          transactionType: this.mapDisplayTypeToEntity(transactionType),
        })
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
        .andWhere('t.type = :transactionType', {
          transactionType: this.mapDisplayTypeToEntity(transactionType),
        })
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

  /**
   * Private: Convert transaction entity type to limit display type
   */
  private mapDisplayTypeToEntity(displayType: string): string {
    const mapping: { [key: string]: string } = {
      SEND: 'DEPOSIT',
      WITHDRAW: 'WITHDRAW',
      EXCHANGE: 'SWAP',
      SWAP: 'SWAP',
    };
    return mapping[displayType] || displayType;
  }

  /**
   * Private: Sum rows and convert to USD
   */
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

  /**
   * Private: Convert amount from one currency to USD
   */
  private async convertToUsd(currency: string, amount: number): Promise<number> {
    const normalizedCurrency = currency.toUpperCase();
    if (normalizedCurrency === 'USD') {
      return amount;
    }

    if (!currency || amount <= 0) {
      return 0;
    }

    try {
      const rate = await this.exchangeRatesService.getRate(
        normalizedCurrency,
        'USD',
      );
      return amount * rate.rate;
    } catch (error) {
      // If exchange rate lookup fails, return 0 for safety
      return 0;
    }
  }
}
