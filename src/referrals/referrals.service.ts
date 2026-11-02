import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { User } from '../users/user.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import {
  LedgerAccountType,
  LedgerDirection,
  LedgerEntry,
} from '../ledger/entities/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { ReferralStatsDto } from './dto/referral-stats.dto';
import { ReferralItemDto } from './dto/referral-item.dto';
import { FirebaseService } from '../firebase/firebase.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { ActivityFeedType } from '../unified-activity-feed/entities/activity-feed-item.entity';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private readonly inFlightByReferee = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Referral)
    private readonly referralsRepository: Repository<Referral>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly webhookService: WebhookService,
    private readonly activityFeedService: UnifiedActivityFeedService,
    @Optional()
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepository?: Repository<LedgerEntry>,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async createPendingReferral(
    referrerId: string,
    refereeId: string,
  ): Promise<Referral> {
    if (referrerId === refereeId) {
      throw new BadRequestException('Users cannot refer themselves');
    }

    const existing = await this.referralsRepository.findOne({
      where: { refereeId },
    });

    if (existing) {
      return existing;
    }

    const referral = this.referralsRepository.create({
      referrerId,
      refereeId,
      status: ReferralStatus.PENDING,
      rewardAmount: null,
      rewardCurrency: null,
      rewardedAt: null,
    });

    return this.referralsRepository.save(referral);
  }

  async getReferralStats(userId: string): Promise<ReferralStatsDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const referrals = await this.referralsRepository.find({
      where: { referrerId: userId },
    });

    const pendingRewards = referrals.filter(
      (referral) => referral.status === ReferralStatus.PENDING,
    ).length;

    const totalEarned = referrals
      .filter((referral) => referral.status === ReferralStatus.REWARDED)
      .reduce(
        (sum, referral) => sum + parseFloat(referral.rewardAmount ?? '0'),
        0,
      );

    return {
      referralCode: user.referralCode,
      referralCount: referrals.length,
      pendingRewards,
      totalEarned,
    };
  }

  async getUserReferrals(userId: string): Promise<ReferralItemDto[]> {
    const referrals = await this.referralsRepository.find({
      where: { referrerId: userId },
      relations: ['referee'],
      order: { createdAt: 'DESC' },
    });

    return referrals.map((referral) => ({
      id: referral.id,
      status: referral.status,
      rewardAmount: referral.rewardAmount,
      rewardCurrency: referral.rewardCurrency,
      rewardedAt: referral.rewardedAt,
      createdAt: referral.createdAt,
      referee: {
        id: referral.referee.id,
        email: referral.referee.email,
        firstName: referral.referee.firstName,
        lastName: referral.referee.lastName,
        createdAt: referral.referee.createdAt,
      },
    }));
  }

  async findByUserId(userId: string): Promise<Referral[]> {
    return this.referralsRepository.find({
      where: [{ referrerId: userId }, { refereeId: userId }],
      order: { createdAt: 'DESC' },
    });
  }

  async processReferralReward(
    refereeIdOrInput:
      | string
      | {
          userId: string;
          depositId?: string;
          amount?: number;
          currency?: string;
        },
  ): Promise<void> {
    const refereeId =
      typeof refereeIdOrInput === 'string'
        ? refereeIdOrInput
        : refereeIdOrInput.userId;

    const previous = this.inFlightByReferee.get(refereeId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.executeReferralReward(refereeId));

    this.inFlightByReferee.set(refereeId, current);
    try {
      await current;
    } finally {
      if (this.inFlightByReferee.get(refereeId) === current) {
        this.inFlightByReferee.delete(refereeId);
      }
    }
  }

  private async executeReferralReward(refereeId: string): Promise<void> {
    const referee = await this.usersRepository.findOne({
      where: { id: refereeId },
    });

    if (!referee || !referee.referredBy) {
      return;
    }

    let referral = await this.referralsRepository.findOne({
      where: { refereeId },
    });

    if (!referral) {
      referral = await this.createPendingReferral(
        referee.referredBy,
        refereeId,
      );
    }

    if (referral.status === ReferralStatus.REWARDED) {
      return;
    }

    const onChainDepositCount = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId: refereeId })
      .andWhere('transaction.type = :type', { type: TransactionType.DEPOSIT })
      .andWhere('transaction.status = :status', {
        status: TransactionStatus.SUCCESS,
      })
      .andWhere('transaction.txHash IS NOT NULL')
      .andWhere("transaction.txHash <> ''")
      .getCount();

    if (onChainDepositCount === 0) {
      return;
    }

    const rewardAmount =
      this.configService.get<string>('REFERRAL_REWARD_AMOUNT') || '0';
    const rewardCurrency =
      this.configService.get<string>('REFERRAL_REWARD_CURRENCY') || 'USD';

    const runRewardMutation = async (
      manager?: EntityManager,
    ): Promise<{
      savedReferral: Referral;
      referrer: User | null;
    } | null> => {
      const referralRepo = manager
        ? manager.getRepository(Referral)
        : this.referralsRepository;
      const userRepo = manager
        ? manager.getRepository(User)
        : this.usersRepository;
      const txRepo = manager
        ? manager.getRepository(Transaction)
        : this.transactionsRepository;
      const ledgerRepo = manager
        ? manager.getRepository(LedgerEntry)
        : this.ledgerRepository;

      const lockedReferral = manager
        ? await referralRepo.findOne({
            where: { refereeId },
            lock: { mode: 'pessimistic_write' },
          })
        : await referralRepo.findOne({
            where: { refereeId },
          });

      const targetReferral = lockedReferral ?? referral;
      if (
        !targetReferral ||
        targetReferral.status === ReferralStatus.REWARDED
      ) {
        return null;
      }

      if (typeof referralRepo.update === 'function' && targetReferral.id) {
        const updateResult = await referralRepo.update(
          { id: targetReferral.id, status: ReferralStatus.PENDING },
          {
            status: ReferralStatus.REWARDED,
            rewardAmount,
            rewardCurrency,
            rewardedAt: new Date(),
          },
        );
        if (
          updateResult &&
          typeof updateResult.affected === 'number' &&
          updateResult.affected === 0
        ) {
          return null;
        }
      }

      targetReferral.status = ReferralStatus.REWARDED;
      targetReferral.rewardAmount = rewardAmount;
      targetReferral.rewardCurrency = rewardCurrency;
      targetReferral.rewardedAt = targetReferral.rewardedAt ?? new Date();

      const savedReferral =
        (await referralRepo.save(targetReferral)) ?? targetReferral;

      const referrer = await userRepo.findOne({
        where: { id: targetReferral.referrerId },
        ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });

      const numericReward = parseFloat(rewardAmount);
      if (referrer) {
        const currentBalances = { ...(referrer.balances || {}) };
        const previousBalance = Number(currentBalances[rewardCurrency] ?? 0);
        currentBalances[rewardCurrency] = Number(
          (previousBalance + numericReward).toFixed(8),
        );
        referrer.balances = currentBalances;
        if (typeof userRepo.save === 'function') {
          await userRepo.save(referrer);
        } else if (typeof userRepo.update === 'function') {
          await userRepo.update(
            { id: referrer.id },
            { balances: currentBalances },
          );
        }
      }

      const rewardTxData: Partial<Transaction> = {
        userId: targetReferral.referrerId,
        type: TransactionType.DEPOSIT,
        amount: rewardAmount,
        currency: rewardCurrency,
        rate: '1',
        status: TransactionStatus.SUCCESS,
        reference: `referral:${savedReferral.id ?? refereeId}`,
        metadata: {
          source: 'referral',
          referralId: savedReferral.id,
          refereeId,
        },
      };

      const rewardTx =
        typeof txRepo.create === 'function'
          ? txRepo.create(rewardTxData as Transaction)
          : (rewardTxData as Transaction);
      const savedTx =
        typeof txRepo.save === 'function'
          ? ((await txRepo.save(rewardTx)) ?? rewardTx)
          : rewardTx;

      if (ledgerRepo && typeof ledgerRepo.save === 'function') {
        const txId = savedTx?.id ?? savedReferral.id ?? refereeId;
        const rawLegs: Partial<LedgerEntry>[] = [
          {
            transactionId: txId,
            accountType: LedgerAccountType.USER,
            direction: LedgerDirection.CREDIT,
            amount: rewardAmount,
            currency: rewardCurrency,
          },
          {
            transactionId: txId,
            accountType: LedgerAccountType.PLATFORM_LIABILITY,
            direction: LedgerDirection.DEBIT,
            amount: rewardAmount,
            currency: rewardCurrency,
          },
        ];
        const legs =
          typeof ledgerRepo.create === 'function'
            ? ledgerRepo.create(rawLegs as LedgerEntry[])
            : (rawLegs as LedgerEntry[]);
        await ledgerRepo.save(legs);
      }

      return { savedReferral, referrer };
    };

    const committed =
      this.dataSource && typeof this.dataSource.transaction === 'function'
        ? await this.dataSource.transaction((manager) =>
            runRewardMutation(manager),
          )
        : await runRewardMutation();

    if (!committed) {
      return;
    }

    const { savedReferral, referrer } = committed;

    await Promise.resolve(
      this.activityFeedService?.append?.(
        savedReferral.referrerId,
        ActivityFeedType.REFERRAL_REWARD,
        savedReferral.id,
        'Referral',
      ),
    ).catch((err) =>
      this.logger.error(`Failed to append referral activity: ${err.message}`),
    );

    await this.notificationsService.dispatch(
      savedReferral.referrerId,
      NotificationType.TRANSACTION,
      'Referral Reward Earned',
      `You earned ${rewardAmount} ${rewardCurrency} from your referral.`,
      {
        referralId: savedReferral.id,
        refereeId,
        rewardAmount: rewardAmount.toString(),
        rewardCurrency,
      },
    );

    if (referrer && referrer.fcmTokens && referrer.fcmTokens.length > 0) {
      Promise.resolve(
        this.firebaseService?.sendToTokens?.(
          referrer.fcmTokens,
          'Referral Reward Earned',
          `You earned ${rewardAmount} ${rewardCurrency} from your referral.`,
          {
            referralId: savedReferral.id,
          },
        ),
      ).catch((err) =>
        this.logger.error(`Failed to send Referral FCM: ${err.message}`),
      );
    }

    this.logger.log(
      `Referral reward issued for referrer ${savedReferral.referrerId} and referee ${refereeId}`,
    );

    Promise.resolve(
      this.webhookService?.dispatch?.(
        'referral.rewarded',
        savedReferral,
        savedReferral.referrerId,
      ),
    ).catch((err) =>
      this.logger.error(`Webhook dispatch failed: ${err.message}`),
    );
  }
}
