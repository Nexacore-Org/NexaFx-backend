import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import { StellarService } from '../../modules/stellar/stellar.service';
import { RedisService } from '../../modules/redis/redis.service';
import { WalletsService } from '../../wallets/wallets.service';
import { UsersService } from '../../users/users.service';

export enum ConfidenceLabel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export interface ConfidenceFactor {
  name: string;
  impact: number;
  description: string;
}

export interface ConfidenceResult {
  score: number;
  label: ConfidenceLabel;
  expectedCompletionSeconds: number;
  expectedCompletionLabel: string;
  factors: ConfidenceFactor[];
}

export interface StellarNetworkStatus {
  ledgerCloseTimeMs: number;
  baseFee: string;
  queuedTransactions: number;
  networkStatus: 'HEALTHY' | 'DEGRADED' | 'CONGESTED';
  lastLedger: number;
  ledgerCloseTime: string;
}

export interface UserCompletionStats {
  averageCompletionSeconds: number;
  totalTransactions: number;
  periodDays: number;
}

const NETWORK_STATUS_CACHE_TTL = 15;
const CONFIDENCE_CACHE_TTL = 30;

const HORIZON_LEDGER_CLOSE_MS: Record<string, number> = {
  TESTNET: 5000,
  PUBLIC: 5500,
};

@Injectable()
export class TransactionConfidenceService {
  private readonly logger = new Logger(TransactionConfidenceService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly stellarService: StellarService,
    private readonly redisService: RedisService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
  ) {}

  async score(
    transaction: Partial<Transaction>,
  ): Promise<ConfidenceResult> {
    const cacheKey = this.redisService.key(
      'confidence',
      `score:${transaction.id ?? 'pending'}`,
    );
    const cached = await this.redisService.getJson<ConfidenceResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const factors: ConfidenceFactor[] = [];
    let baseScore = 70;

    const networkStatus = await this.getNetworkStatus();

    const networkImpact = this.scoreNetworkConditions(networkStatus);
    factors.push(networkImpact);
    baseScore += networkImpact.impact;

    if (transaction.amount) {
      const balanceImpact = await this.scoreWalletBalance(
        transaction as Transaction,
      );
      factors.push(balanceImpact);
      baseScore += balanceImpact.impact;
    }

    const historicalImpact = await this.scoreHistoricalCompletion(
      transaction.type,
    );
    factors.push(historicalImpact);
    baseScore += historicalImpact.impact;

    const recipientImpact = await this.scoreRecipient(
      transaction as Transaction,
    );
    factors.push(recipientImpact);
    baseScore += recipientImpact.impact;

    const score = Math.max(0, Math.min(100, baseScore));
    const label = this.getConfidenceLabel(score);
    const expectedCompletionSeconds =
      this.getExpectedCompletionSeconds(score, networkStatus);
    const expectedCompletionLabel =
      this.formatExpectedCompletion(expectedCompletionSeconds);

    const result: ConfidenceResult = {
      score,
      label,
      expectedCompletionSeconds,
      expectedCompletionLabel,
      factors,
    };

    await this.redisService.setJson(cacheKey, result, CONFIDENCE_CACHE_TTL);

    return result;
  }

  async getNetworkStatus(): Promise<StellarNetworkStatus> {
    const cacheKey = this.redisService.key('network', 'stellar:status');
    const cached =
      await this.redisService.getJson<StellarNetworkStatus>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const feeStats = await this.stellarService.getNetworkFeeStats();

      const ledgerCloseTimeMs = parseInt(
        feeStats.ledger_capacity_stats?.ledger_close_time_ms ?? '5500',
        10,
      );
      const baseFee = feeStats.p50_accepted_fee ?? '100';
      const queuedTransactions =
        parseInt(feeStats.transaction_capacity_pending ?? '0', 10);

      let networkStatus: 'HEALTHY' | 'DEGRADED' | 'CONGESTED' = 'HEALTHY';
      if (queuedTransactions > 100) {
        networkStatus = 'CONGESTED';
      } else if (queuedTransactions > 20 || ledgerCloseTimeMs > 8000) {
        networkStatus = 'DEGRADED';
      }

      const lastLedgerRecord = await this.stellarService.getLatestLedger();

      const lastLedger = lastLedgerRecord?.sequence ?? 0;
      const ledgerCloseTime =
        lastLedgerRecord?.closed_at ?? new Date().toISOString();

      const result: StellarNetworkStatus = {
        ledgerCloseTimeMs,
        baseFee,
        queuedTransactions,
        networkStatus,
        lastLedger,
        ledgerCloseTime,
      };

      await this.redisService.setJson(
        cacheKey,
        result,
        NETWORK_STATUS_CACHE_TTL,
      );

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to fetch Stellar network status: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        ledgerCloseTimeMs: 5500,
        baseFee: '100',
        queuedTransactions: 0,
        networkStatus: 'HEALTHY',
        lastLedger: 0,
        ledgerCloseTime: new Date().toISOString(),
      };
    }
  }

  async getCompletionStats(
    userId: string,
  ): Promise<UserCompletionStats> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await this.transactionRepository
      .createQueryBuilder('t')
      .select('COUNT(*)', 'totalTransactions')
      .addSelect(
        `AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")))`,
        'averageCompletionSeconds',
      )
      .where('t."userId" = :userId', { userId })
      .andWhere('t.type IN (:...types)', {
        types: [TransactionType.DEPOSIT, TransactionType.WITHDRAW],
      })
      .andWhere('t.status = :status', { status: TransactionStatus.SUCCESS })
      .andWhere('t."createdAt" >= :since', { since: thirtyDaysAgo })
      .getRawOne();

    return {
      averageCompletionSeconds: parseFloat(
        stats?.averageCompletionSeconds ?? '0',
      ),
      totalTransactions: parseInt(stats?.totalTransactions ?? '0', 10),
      periodDays: 30,
    };
  }

  private scoreNetworkConditions(
    network: StellarNetworkStatus,
  ): ConfidenceFactor {
    let impact = 0;
    let description = 'Network is operating normally';

    if (network.networkStatus === 'HEALTHY') {
      impact = 10;
      description = 'Stellar network is healthy';
    } else if (network.networkStatus === 'DEGRADED') {
      impact = -5;
      description = 'Stellar network is experiencing mild congestion';
    } else {
      impact = -15;
      description = 'Stellar network is congested — expect delays';
    }

    if (network.ledgerCloseTimeMs > 8000) {
      impact -= 5;
      description += ` (ledger close time: ${network.ledgerCloseTimeMs}ms)`;
    }

    return {
      name: 'network_conditions',
      impact,
      description,
    };
  }

  private async scoreWalletBalance(
    transaction: Transaction,
  ): Promise<ConfidenceFactor> {
    let impact = 0;
    let description = 'Sufficient wallet balance';

    try {
      const wallets = await this.walletsService.findAllByUser(
        transaction.userId,
      );
      const wallet = wallets.find(
        (w) => w.currency === transaction.currency,
      );

      if (wallet) {
        const walletBalance = parseFloat(wallet.balance);
        const txAmount = parseFloat(transaction.amount);

        if (walletBalance < txAmount) {
          impact = -20;
          description = 'Insufficient wallet balance — transaction may fail';
        } else if (walletBalance < txAmount * 1.1) {
          impact = -5;
          description =
            'Wallet balance close to transaction amount — buffer is low';
        } else {
          impact = 5;
          description = 'Sufficient wallet balance for this transaction';
        }
      }
    } catch {
      this.logger.warn('Could not check wallet balance for confidence score');
    }

    return {
      name: 'wallet_balance',
      impact,
      description,
    };
  }

  private async scoreHistoricalCompletion(
    type?: TransactionType,
  ): Promise<ConfidenceFactor> {
    let impact = 0;
    let description = 'Historical data unavailable';

    try {
      const stats = await this.transactionRepository
        .createQueryBuilder('t')
        .select(
          'AVG(EXTRACT(EPOCH FROM (t."updatedAt" - t."createdAt")))',
          'avgCompletionSeconds',
        )
        .where('t.type = :type', {
          type: type ?? TransactionType.DEPOSIT,
        })
        .andWhere('t.status = :status', {
          status: TransactionStatus.SUCCESS,
        })
        .andWhere('t."createdAt" >= :since', {
          since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        })
        .getRawOne();

      const avgSeconds = parseFloat(stats?.avgCompletionSeconds ?? '0');

      if (avgSeconds > 0) {
        if (avgSeconds < 10) {
          impact = 10;
          description = `This type typically completes in under ${Math.round(avgSeconds)} seconds`;
        } else if (avgSeconds < 60) {
          impact = 0;
          description = `This type typically completes in ${Math.round(avgSeconds)} seconds`;
        } else {
          impact = -5;
          description = `This type typically takes ${Math.round(avgSeconds / 60)} minutes`;
        }
      }
    } catch {
      this.logger.warn(
        'Could not fetch historical completion stats for confidence score',
      );
    }

    return {
      name: 'historical_completion',
      impact,
      description,
    };
  }

  private async scoreRecipient(
    transaction: Transaction,
  ): Promise<ConfidenceFactor> {
    let impact = 0;
    let description = 'Recipient validation skipped';

    if (transaction.type === TransactionType.DEPOSIT) {
      impact = 5;
      description = 'Incoming deposit — recipient validation not required';
      return {
        name: 'recipient_account',
        impact,
        description,
      };
    }

    if (transaction.metadata?.destinationAddress) {
      try {
        await this.stellarService.getAccountBalance(
          transaction.metadata.destinationAddress,
        );
        impact = 5;
        description = 'Recipient Stellar account is active and funded';
      } catch {
        impact = -10;
        description =
          'Recipient Stellar account not found or not activated — may require account funding first';
      }
    }

    return {
      name: 'recipient_account',
      impact,
      description,
    };
  }

  private getConfidenceLabel(score: number): ConfidenceLabel {
    if (score >= 80) return ConfidenceLabel.HIGH;
    if (score >= 50) return ConfidenceLabel.MEDIUM;
    return ConfidenceLabel.LOW;
  }

  private getExpectedCompletionSeconds(
    score: number,
    network: StellarNetworkStatus,
  ): number {
    const baseTime = HORIZON_LEDGER_CLOSE_MS.TESTNET / 1000;

    if (score >= 80) {
      return Math.round(baseTime * 2);
    }
    if (score >= 50) {
      return Math.round(baseTime * 6);
    }
    return Math.round(baseTime * 60);
  }

  private formatExpectedCompletion(seconds: number): string {
    if (seconds < 10) {
      return 'Expected to complete in under 10 seconds';
    }
    if (seconds < 60) {
      return `Expected to complete in ${seconds} seconds`;
    }
    const minutes = Math.round(seconds / 60);
    return `May take ${minutes} minute${minutes > 1 ? 's' : ''} due to network conditions`;
  }
}
