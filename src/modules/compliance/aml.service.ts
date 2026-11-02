import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Between } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { AmlConfig } from './entities/aml-config.entity';
import { ComplianceFlagService } from './compliance-flag.service';

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
  ) {}

  async enqueue(transactionId: string): Promise<void> {
    await this.amlQueue.add(
      'check',
      { transactionId },
      { jobId: `aml-${transactionId}` },
    );
  }

  async evaluate(transaction: Transaction): Promise<string[]> {
    const config = await this.getConfig();
    const amountUsd = Number(transaction.amount);
    const matchedRules: string[] = [];

    if (
      config.largeTxThresholdUsd != null &&
      amountUsd > Number(config.largeTxThresholdUsd)
    ) {
      this.logger.log(
        `Rule triggered: large_transaction for tx ${transaction.id}`,
      );
      matchedRules.push('large_transaction');
    }

    if (
      config.newAccountAgeDays != null &&
      config.newAccountLargeTxThresholdUsd != null
    ) {
      const accountAgeDays = await this.getAccountAgeDays(transaction.userId);
      if (
        accountAgeDays < Number(config.newAccountAgeDays) &&
        amountUsd > Number(config.newAccountLargeTxThresholdUsd)
      ) {
        this.logger.log(
          `Rule triggered: new_account_large_tx for tx ${transaction.id}`,
        );
        matchedRules.push('new_account_large_tx');
      }
    }

    if (
      config.rapidMovementWindowMinutes != null &&
      config.rapidMovementCount != null
    ) {
      const recentCount = await this.countUserTxInPeriod(
        transaction.userId,
        Number(config.rapidMovementWindowMinutes) * 60,
      );
      if (recentCount >= Number(config.rapidMovementCount)) {
        this.logger.log(
          `Rule triggered: rapid_movement for tx ${transaction.id}`,
        );
        matchedRules.push('rapid_movement');
      }
    }

    if (
      config.roundTripWindowMinutes != null &&
      (await this.checkRoundTrip(
        transaction,
        Number(config.roundTripWindowMinutes),
      ))
    ) {
      this.logger.log(`Rule triggered: round_trip for tx ${transaction.id}`);
      matchedRules.push('round_trip');
    }

    if (
      config.largeTxThresholdUsd != null &&
      config.structuringCount != null &&
      config.structuringWindowHours != null &&
      (await this.checkStructuring(
        transaction.userId,
        amountUsd,
        Number(config.largeTxThresholdUsd),
        Number(config.structuringCount),
        Number(config.structuringWindowHours),
      ))
    ) {
      this.logger.log(`Rule triggered: structuring for tx ${transaction.id}`);
      matchedRules.push('structuring');
    }

    return matchedRules;
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

    const since = new Date(
      new Date(transaction.createdAt).getTime() - windowMinutes * 60 * 1000,
    );
    const until = new Date(
      new Date(transaction.createdAt).getTime() + windowMinutes * 60 * 1000,
    );
    const amount = Number(transaction.amount);

    const matchingDeposit = await this.transactionRepo.findOne({
      where: {
        userId: transaction.userId,
        type: TransactionType.DEPOSIT,
        amount: String(amount),
        createdAt: Between(since, until),
        status: TransactionStatus.SUCCESS,
      },
    });

    return !!matchingDeposit;
  }

  private async checkStructuring(
    userId: string,
    amountUsd: number,
    largeTxThreshold: number,
    structuringCount: number,
    structuringWindowHours: number,
  ): Promise<boolean> {
    const nearThresholdMin = largeTxThreshold * 0.9;
    if (amountUsd < nearThresholdMin) return false;

    const since = new Date(
      Date.now() - structuringWindowHours * 60 * 60 * 1000,
    );

    const actualNearThreshold = await this.transactionRepo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.createdAt > :since', { since })
      .andWhere('tx.status = :status', { status: TransactionStatus.SUCCESS })
      .andWhere('CAST(tx.amount AS DECIMAL) >= :minAmount', {
        minAmount: nearThresholdMin,
      })
      .andWhere('CAST(tx.amount AS DECIMAL) < :maxAmount', {
        maxAmount: largeTxThreshold,
      })
      .getCount();

    return actualNearThreshold >= structuringCount;
  }
}
