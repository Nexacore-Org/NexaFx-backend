import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionLimit } from './entities/transaction-limit.entity';
import { FeeConfig } from './entities/fee-config.entity';
import { User, UserKycTier } from '../../users/user.entity';
import { Transaction, TransactionStatus } from '../../transactions/entities/transaction.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

export interface CheckLimitResult {
  allowed: boolean;
  reason?: string;
  remaining: {
    daily: number;
    monthly: number;
  };
}

export interface CalculatedFeeResult {
  feeAmount: number;
  feeCurrency: string;
  feeType: any;
}

@Injectable()
export class LimitsService {
  constructor(
    @InjectRepository(TransactionLimit)
    private readonly limitRepository: Repository<TransactionLimit>,
    @InjectRepository(FeeConfig)
    private readonly feeRepository: Repository<FeeConfig>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async getUserKycTier(userId: string): Promise<UserKycTier> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const emailVerified = Boolean(user.isEmailVerified ?? user.isVerified);
    const kycApproved = Boolean((user as any).kycApproved || user.kycTier === UserKycTier.FULL);

    if (kycApproved) {
      return UserKycTier.FULL;
    }
    if (emailVerified) {
      return UserKycTier.BASIC;
    }
    return UserKycTier.UNVERIFIED;
  }

  async checkLimit(
    userId: string,
    transactionType: string,
    amount: number,
    currency: string,
  ): Promise<CheckLimitResult> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Transaction amount must be positive');
    }

    const tier = await this.getUserKycTier(userId);
    const limitConfig = await this.getLimitConfigForTier(tier, transactionType);

    if (!limitConfig || !limitConfig.isActive) {
      throw new UnprocessableEntityException({
        allowed: false,
        reason: `Inactive or missing transaction limit configuration for tier ${tier}`,
        remaining: { daily: 0, monthly: 0 },
      });
    }

    const amountUsd = await this.convertToUsd(currency, amount);
    const usage = await this.getUsageInUsd(userId);

    const singleMax = Number(limitConfig.singleTransactionMax ?? limitConfig.singleTxLimitUsd ?? 0);
    const dailyMax = Number(limitConfig.dailyMax ?? limitConfig.dailyLimitUsd ?? 0);
    const monthlyMax = Number(limitConfig.monthlyMax ?? limitConfig.monthlyLimitUsd ?? 0);

    const remainingDaily = Number(Math.max(dailyMax - usage.todayUsd, 0).toFixed(8));
    const remainingMonthly = Number(Math.max(monthlyMax - usage.monthUsd, 0).toFixed(8));

    if (amountUsd > singleMax) {
      const reason = `Single transaction limit exceeded. Max allowed: $${singleMax}`;
      throw new UnprocessableEntityException({
        allowed: false,
        reason,
        remaining: { daily: remainingDaily, monthly: remainingMonthly },
      });
    }

    if (usage.todayUsd + amountUsd > dailyMax) {
      const reason = `Daily transaction limit exceeded. Remaining daily limit: $${remainingDaily}`;
      throw new UnprocessableEntityException({
        allowed: false,
        reason,
        remaining: { daily: remainingDaily, monthly: remainingMonthly },
      });
    }

    if (usage.monthUsd + amountUsd > monthlyMax) {
      const reason = `Monthly transaction limit exceeded. Remaining monthly limit: $${remainingMonthly}`;
      throw new UnprocessableEntityException({
        allowed: false,
        reason,
        remaining: { daily: remainingDaily, monthly: remainingMonthly },
      });
    }

    return {
      allowed: true,
      remaining: {
        daily: remainingDaily,
        monthly: remainingMonthly,
      },
    };
  }

  async calculateFee(
    transactionType: string,
    amount: number,
    currency: string = 'USD',
  ): Promise<CalculatedFeeResult> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const feeConfig = await this.getFeeConfigForType(transactionType, currency);
    if (!feeConfig || !feeConfig.isActive) {
      return {
        feeAmount: 0,
        feeCurrency: currency,
        feeType: 'FLAT',
      };
    }

    const feeVal = Number(feeConfig.feeValue);
    let rawFee = 0;

    const typeUpper = (feeConfig.feeType || '').toUpperCase();
    if (typeUpper === 'PERCENT' || typeUpper === 'PERCENTAGE') {
      if (feeVal < 0.05 && feeVal > 0) {
        rawFee = amount * feeVal;
      } else {
        rawFee = amount * (feeVal / 100);
      }
    } else {
      rawFee = feeVal;
    }

    if (feeConfig.minFee !== null && feeConfig.minFee !== undefined) {
      const min = Number(feeConfig.minFee);
      if (rawFee < min) {
        rawFee = min;
      }
    }

    if (feeConfig.maxFee !== null && feeConfig.maxFee !== undefined) {
      const max = Number(feeConfig.maxFee);
      if (rawFee > max) {
        rawFee = max;
      }
    }

    return {
      feeAmount: Number(rawFee.toFixed(8)),
      feeCurrency: feeConfig.currency || currency,
      feeType: feeConfig.feeType,
    };
  }

  async getUserLimitStatus(userId: string) {
    const tier = await this.getUserKycTier(userId);
    const limitConfig = await this.getLimitConfigForTier(tier);
    const usage = await this.getUsageInUsd(userId);

    const singleMax = limitConfig ? Number(limitConfig.singleTransactionMax ?? limitConfig.singleTxLimitUsd ?? 0) : 0;
    const dailyMax = limitConfig ? Number(limitConfig.dailyMax ?? limitConfig.dailyLimitUsd ?? 0) : 0;
    const monthlyMax = limitConfig ? Number(limitConfig.monthlyMax ?? limitConfig.monthlyLimitUsd ?? 0) : 0;

    const remainingDaily = Number(Math.max(dailyMax - usage.todayUsd, 0).toFixed(8));
    const remainingMonthly = Number(Math.max(monthlyMax - usage.monthUsd, 0).toFixed(8));

    return {
      kycTier: tier,
      limits: {
        singleTransactionMax: singleMax,
        dailyMax,
        monthlyMax,
        currency: limitConfig?.currency || 'USD',
      },
      usage: {
        daily: usage.todayUsd,
        monthly: usage.monthUsd,
      },
      remaining: {
        daily: remainingDaily,
        monthly: remainingMonthly,
      },
    };
  }

  // Admin Operations
  async getAllLimits(): Promise<TransactionLimit[]> {
    return this.limitRepository.find();
  }

  async updateLimit(id: string, updateData: Partial<TransactionLimit>): Promise<TransactionLimit> {
    const limit = await this.limitRepository.findOne({ where: { id } });
    if (!limit) {
      throw new NotFoundException(`Transaction limit with ID ${id} not found`);
    }
    Object.assign(limit, updateData);
    return this.limitRepository.save(limit);
  }

  async getAllFees(): Promise<FeeConfig[]> {
    return this.feeRepository.find();
  }

  async updateFee(id: string, updateData: Partial<FeeConfig>): Promise<FeeConfig> {
    const fee = await this.feeRepository.findOne({ where: { id } });
    if (!fee) {
      throw new NotFoundException(`Fee config with ID ${id} not found`);
    }
    Object.assign(fee, updateData);
    return this.feeRepository.save(fee);
  }

  // Helpers
  private async getLimitConfigForTier(tier: UserKycTier, transactionType?: string): Promise<TransactionLimit | null> {
    if (transactionType) {
      const typeSpecific = await this.limitRepository.findOne({
        where: { kycTier: tier as any, transactionType: transactionType as any, isActive: true },
      });
      if (typeSpecific) return typeSpecific;
    }

    const tierLimit = await this.limitRepository.findOne({
      where: [
        { kycTier: tier as any, isActive: true },
        { tier: tier as any } as any,
      ],
    });
    return tierLimit;
  }

  private async getFeeConfigForType(transactionType: string, currency: string): Promise<FeeConfig | null> {
    const normType = (transactionType || '').toUpperCase();
    let searchTypes = [normType];

    if (normType === 'WITHDRAW') searchTypes.push('WITHDRAWAL');
    if (normType === 'WITHDRAWAL') searchTypes.push('WITHDRAW');
    if (normType === 'DEPOSIT') searchTypes.push('SEND');
    if (normType === 'SEND') searchTypes.push('DEPOSIT');
    if (normType === 'SWAP') searchTypes.push('EXCHANGE', 'CONVERT');
    if (normType === 'EXCHANGE') searchTypes.push('SWAP', 'CONVERT');

    for (const type of searchTypes) {
      const config = await this.feeRepository.findOne({
        where: { transactionType: type, isActive: true },
      });
      if (config) return config;
    }

    return this.feeRepository.findOne({ where: { isActive: true } });
  }

  private async getUsageInUsd(userId: string): Promise<{ todayUsd: number; monthUsd: number }> {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

    const dayTransactions = await this.transactionRepository
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId })
      .andWhere('t.status IN (:...statuses)', { statuses: [TransactionStatus.PENDING, TransactionStatus.SUCCESS] })
      .andWhere('t.createdAt >= :dayStart', { dayStart })
      .getMany();

    const monthTransactions = await this.transactionRepository
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId })
      .andWhere('t.status IN (:...statuses)', { statuses: [TransactionStatus.PENDING, TransactionStatus.SUCCESS] })
      .andWhere('t.createdAt >= :monthStart', { monthStart })
      .getMany();

    let todayUsd = 0;
    for (const tx of dayTransactions) {
      todayUsd += await this.convertToUsd(tx.currency, Number(tx.amount));
    }

    let monthUsd = 0;
    for (const tx of monthTransactions) {
      monthUsd += await this.convertToUsd(tx.currency, Number(tx.amount));
    }

    return {
      todayUsd: Number(todayUsd.toFixed(8)),
      monthUsd: Number(monthUsd.toFixed(8)),
    };
  }

  private async convertToUsd(currency: string, amount: number): Promise<number> {
    const norm = (currency || 'USD').toUpperCase();
    if (norm === 'USD') return amount;

    try {
      const res = await this.exchangeRatesService.getRate(norm, 'USD');
      return amount * (res.rate || 1);
    } catch (err) {
      throw new BadRequestException(`Unable to fetch exchange rate for currency ${currency}`);
    }
  }
}
