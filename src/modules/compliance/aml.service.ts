import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Between } from 'typeorm';
import Decimal from 'decimal.js';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { AmlConfig } from './entities/aml-config.entity';
import { ComplianceFlagService } from './compliance-flag.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

const FALLBACK_USD_RATES: Record<string, string> = {
  USD: '1',
  USDC: '1',
  USDT: '1',
  NGN: '0.000625',
  KES: '0.0077',
  GHS: '0.065',
  ZAR: '0.055',
  EUR: '1.08',
  GBP: '1.27',
  XLM: '0.12',
  BTC: '65000',
  ETH: '3000',
};

@Injectable()
export class AmlService {
  private readonly logger = new Logger(AmlService.name);

  constructor(
    @InjectQueue('aml-check') private readonly amlQueue: Queue,
    private readonly flagService: ComplianceFlagService,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AmlConfig)
    private readonly configRepo: Repository<AmlConfig>,
    @Optional()
    private readonly exchangeRatesService?: ExchangeRatesService,
  ) {}

  async enqueue(transactionId: string): Promise<void> {
    await this.amlQueue.add('check', { transactionId });
  }

  async toUsdAmount(
    amount: string | number,
    currency?: string,
    tx?: Partial<Transaction>,
  ): Promise<Decimal> {
    const rawAmount = new Decimal(amount ?? 0);
    const code = (currency || tx?.currency || 'USD').trim().toUpperCase();

    if (code === 'USD') {
      return rawAmount;
    }

    if (
      tx?.toCurrency &&
      tx.toCurrency.trim().toUpperCase() === 'USD' &&
      tx.toAmount !== undefined &&
      tx.toAmount !== null
    ) {
      return new Decimal(tx.toAmount);
    }

    const rate = await this.getUsdRate(code);
    return rawAmount.mul(rate);
  }

  async getUsdRate(currency?: string): Promise<Decimal> {
    const code = (currency || 'USD').trim().toUpperCase();
    if (code === 'USD') {
      return new Decimal(1);
    }

    if (this.exchangeRatesService?.getRate) {
      try {
        const quote = await this.exchangeRatesService.getRate(code, 'USD');
        if (quote && Number(quote.rate) > 0) {
          return new Decimal(quote.rate);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to fetch live USD rate for ${code}, falling back to reference rate: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const fallback = FALLBACK_USD_RATES[code] ?? '1';
    return new Decimal(fallback);
  }

  async evaluate(transaction: Transaction): Promise<string | null> {
    const config = await this.getConfig();
    const amountUsd = await this.toUsdAmount(
      transaction.amount,
      transaction.currency,
      transaction,
    );
    const largeTxThresholdUsd = new Decimal(
      config.largeTxThresholdUsd ?? 10000,
    );

    if (amountUsd.gt(largeTxThresholdUsd)) {
      this.logger.log(
        `Rule triggered: large_transaction for tx ${transaction.id}`,
      );
      return 'large_transaction';
    }

    const accountAgeDays = await this.getAccountAgeDays(transaction.userId);
    const newAccountThresholdUsd = new Decimal(
      config.newAccountLargeTxThresholdUsd ?? 1000,
    );
    if (
      accountAgeDays < config.newAccountAgeDays &&
      amountUsd.gt(newAccountThresholdUsd)
    ) {
      this.logger.log(
        `Rule triggered: new_account_large_tx for tx ${transaction.id}`,
      );
      return 'new_account_large_tx';
    }

    const recentCount = await this.countUserTxInPeriod(
      transaction.userId,
      config.rapidMovementWindowMinutes * 60,
    );
    if (recentCount >= config.rapidMovementCount) {
      this.logger.log(
        `Rule triggered: rapid_movement for tx ${transaction.id}`,
      );
      return 'rapid_movement';
    }

    if (await this.checkRoundTrip(transaction, config.roundTripWindowMinutes)) {
      this.logger.log(`Rule triggered: round_trip for tx ${transaction.id}`);
      return 'round_trip';
    }

    if (
      await this.checkStructuring(
        transaction.userId,
        amountUsd,
        largeTxThresholdUsd,
        config.structuringCount,
        config.structuringWindowHours,
        transaction.currency,
      )
    ) {
      this.logger.log(`Rule triggered: structuring for tx ${transaction.id}`);
      return 'structuring';
    }

    return null;
  }

  private async getConfig(): Promise<AmlConfig> {
    let config = await this.configRepo.findOne({ where: {} });
    if (!config) {
      config = this.configRepo.create();
      config = await this.configRepo.save(config);
    }
    return config;
  }

  private async getAccountAgeDays(userId: string): Promise<number> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['createdAt'],
    });
    if (!user) return 999;
    const ageMs = Date.now() - new Date(user.createdAt).getTime();
    return ageMs / (1000 * 60 * 60 * 24);
  }

  private async countUserTxInPeriod(
    userId: string,
    seconds: number,
  ): Promise<number> {
    const since = new Date(Date.now() - seconds * 1000);
    return this.transactionRepo.count({
      where: {
        userId,
        createdAt: MoreThan(since),
        status: TransactionStatus.SUCCESS,
      },
    });
  }

  private async checkRoundTrip(
    transaction: Transaction,
    windowMinutes: number,
  ): Promise<boolean> {
    if (transaction.type !== TransactionType.WITHDRAW) return false;

    const txTime = transaction.createdAt
      ? new Date(transaction.createdAt).getTime()
      : Date.now();
    const since = new Date(txTime - windowMinutes * 60 * 1000);
    const until = new Date(txTime + windowMinutes * 60 * 1000);

    const targetAmount = new Decimal(transaction.amount);
    const tolerance = Decimal.max(
      targetAmount.abs().mul(new Decimal('0.0001')),
      new Decimal('0.01'),
    );

    const qb = this.transactionRepo?.createQueryBuilder?.('tx');
    if (qb) {
      qb.where('tx.userId = :userId', { userId: transaction.userId })
        .andWhere('tx.type = :type', { type: TransactionType.DEPOSIT })
        .andWhere('tx.status = :status', { status: TransactionStatus.SUCCESS })
        .andWhere('tx.createdAt BETWEEN :since AND :until', { since, until })
        .andWhere(
          'ABS(CAST(tx.amount AS DECIMAL) - CAST(:targetAmount AS DECIMAL)) <= CAST(:tolerance AS DECIMAL)',
          {
            targetAmount: targetAmount.toFixed(8),
            tolerance: tolerance.toFixed(8),
          },
        );

      if (transaction.currency) {
        qb.andWhere('tx.currency = :currency', {
          currency: transaction.currency,
        });
      }

      if (typeof qb.getOne === 'function') {
        const matched = await qb.getOne();
        if (matched) {
          const depAmount = new Decimal(matched.amount);
          if (depAmount.minus(targetAmount).abs().lte(tolerance)) {
            return true;
          }
        }
      } else if (typeof qb.getMany === 'function') {
        const candidates = await qb.getMany();
        for (const candidate of candidates) {
          const depAmount = new Decimal(candidate.amount);
          if (depAmount.minus(targetAmount).abs().lte(tolerance)) {
            return true;
          }
        }
      }
    }

    const matchingDeposit = await this.transactionRepo.findOne({
      where: {
        userId: transaction.userId,
        type: TransactionType.DEPOSIT,
        createdAt: Between(since, until),
        status: TransactionStatus.SUCCESS,
      },
    });

    if (!matchingDeposit) {
      return false;
    }

    const depositCurrency = (
      matchingDeposit.currency ||
      transaction.currency ||
      'USD'
    )
      .trim()
      .toUpperCase();
    const withdrawCurrency = (transaction.currency || 'USD')
      .trim()
      .toUpperCase();

    if (depositCurrency === withdrawCurrency) {
      const depositAmount = new Decimal(matchingDeposit.amount);
      return depositAmount.minus(targetAmount).abs().lte(tolerance);
    }

    const withdrawUsd = await this.toUsdAmount(
      transaction.amount,
      withdrawCurrency,
      transaction,
    );
    const depositUsd = await this.toUsdAmount(
      matchingDeposit.amount,
      depositCurrency,
      matchingDeposit,
    );
    const usdTolerance = Decimal.max(
      withdrawUsd.abs().mul(new Decimal('0.0001')),
      new Decimal('0.01'),
    );
    return depositUsd.minus(withdrawUsd).abs().lte(usdTolerance);
  }

  private async checkStructuring(
    userId: string,
    amountUsd: Decimal,
    largeTxThresholdUsd: Decimal,
    structuringCount: number,
    structuringWindowHours: number,
    currency?: string,
  ): Promise<boolean> {
    const nearThresholdMinUsd = largeTxThresholdUsd.mul(new Decimal('0.9'));
    if (
      amountUsd.lt(nearThresholdMinUsd) ||
      amountUsd.gte(largeTxThresholdUsd)
    ) {
      return false;
    }

    const since = new Date(
      Date.now() - structuringWindowHours * 60 * 60 * 1000,
    );

    const qb = this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.createdAt > :since', { since })
      .andWhere('tx.status = :status', { status: TransactionStatus.SUCCESS });

    if (typeof qb.getMany === 'function') {
      const candidates = await qb.getMany();
      let nearCount = 0;
      for (const tx of candidates) {
        const txUsd = await this.toUsdAmount(tx.amount, tx.currency, tx);
        if (txUsd.gte(nearThresholdMinUsd) && txUsd.lt(largeTxThresholdUsd)) {
          nearCount++;
        }
      }
      return nearCount >= structuringCount;
    }

    const rate = await this.getUsdRate(currency);
    const minNative = nearThresholdMinUsd.div(rate).toNumber();
    const maxNative = largeTxThresholdUsd.div(rate).toNumber();

    const actualNearThreshold = await qb
      .andWhere('CAST(tx.amount AS DECIMAL) >= :minAmount', {
        minAmount: minNative,
      })
      .andWhere('CAST(tx.amount AS DECIMAL) < :maxAmount', {
        maxAmount: maxNative,
      })
      .getCount();

    return actualNearThreshold >= structuringCount;
  }
}
