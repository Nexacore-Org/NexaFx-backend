import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { User } from '../users/user.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { ReferralStatsDto } from './dto/referral-stats.dto';
import {
  PaginatedReferralsResponseDto,
  ReferralItemDto,
} from './dto/referral-item.dto';
import { FirebaseService } from '../firebase/firebase.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { ActivityFeedType } from '../unified-activity-feed/entities/activity-feed-item.entity';

export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '***';
  }
  const [localPart, domainPart] = email.trim().split('@');
  const maskedLocal = localPart.length > 0 ? `${localPart[0]}***` : '***';
  if (!domainPart) {
    return `${maskedLocal}@***`;
  }
  const dotIndex = domainPart.lastIndexOf('.');
  if (dotIndex <= 0) {
    const maskedDomain = domainPart.length > 0 ? `${domainPart[0]}***` : '***';
    return `${maskedLocal}@${maskedDomain}`;
  }
  const domainName = domainPart.slice(0, dotIndex);
  const tld = domainPart.slice(dotIndex);
  const maskedDomainName =
    domainName.length > 0 ? `${domainName[0]}***` : '***';
  return `${maskedLocal}@${maskedDomainName}${tld}`;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

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

    const totalEarned: Record<string, number> = {};
    for (const referral of referrals) {
      if (referral.status !== ReferralStatus.REWARDED) {
        continue;
      }
      const currency = (referral.rewardCurrency || 'USD').trim().toUpperCase();
      const amount = new Decimal(referral.rewardAmount ?? '0');
      const current = new Decimal(totalEarned[currency] ?? 0);
      totalEarned[currency] = current.plus(amount).toNumber();
    }

    return {
      referralCode: user.referralCode,
      referralCount: referrals.length,
      pendingRewards,
      totalEarned,
      earningsByCurrency: { ...totalEarned },
    };
  }

  async getUserReferrals(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedReferralsResponseDto> {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be an integer >= 1');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }

    const skip = (page - 1) * limit;
    let referrals: Referral[];
    let total: number;

    if (typeof this.referralsRepository.findAndCount === 'function') {
      [referrals, total] = await this.referralsRepository.findAndCount({
        where: { referrerId: userId },
        relations: ['referee'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });
    } else {
      const all = await this.referralsRepository.find({
        where: { referrerId: userId },
        relations: ['referee'],
        order: { createdAt: 'DESC' },
      });
      total = all.length;
      referrals = all.slice(skip, skip + limit);
    }

    const data: ReferralItemDto[] = referrals.map((referral) => ({
      id: referral.id,
      maskedEmail: maskEmail(referral.referee?.email),
      firstName: referral.referee?.firstName ?? null,
      status: referral.status,
      rewardAmount: referral.rewardAmount,
      rewardCurrency: referral.rewardCurrency,
      rewardedAt: referral.rewardedAt,
      createdAt: referral.createdAt,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findByUserId(userId: string): Promise<Referral[]> {
    return this.referralsRepository.find({
      where: [{ referrerId: userId }, { refereeId: userId }],
      order: { createdAt: 'DESC' },
    });
  }

  async processReferralReward(refereeId: string): Promise<void> {
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
      .andWhere('transaction.status IN (:...statuses)', {
        statuses: [TransactionStatus.PENDING, TransactionStatus.SUCCESS],
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

    referral.status = ReferralStatus.REWARDED;
    referral.rewardAmount = rewardAmount;
    referral.rewardCurrency = rewardCurrency;
    referral.rewardedAt = new Date();

    const saved = await this.referralsRepository.save(referral);

    await this.activityFeedService
      .append(
        referral.referrerId,
        ActivityFeedType.REFERRAL_REWARD,
        saved.id,
        'Referral',
      )
      .catch((err) =>
        this.logger.error(`Failed to append referral activity: ${err.message}`),
      );

    await this.notificationsService.dispatch(
      referral.referrerId,
      NotificationType.TRANSACTION,
      'Referral Reward Earned',
      `You earned ${rewardAmount} ${rewardCurrency} from your referral.`,
      {
        referralId: saved.id,
        refereeId,
        rewardAmount,
        rewardCurrency,
      },
    );

    const referrer = await this.usersRepository.findOne({
      where: { id: referral.referrerId },
      select: ['id', 'fcmToken'],
    });
    if (referrer?.fcmToken) {
      await this.firebaseService
        .sendPushNotification(referrer.fcmToken, {
          title: 'Referral Reward Earned! 🎁',
          body: `You earned ${rewardAmount} ${rewardCurrency} from your referral.`,
          data: {
            type: 'REFERRAL_REWARD',
            referralId: saved.id,
            rewardAmount,
            rewardCurrency,
          },
        })
        .catch((err) =>
          this.logger.error(`Failed to send referral FCM push: ${err.message}`),
        );
    }

    await this.webhookService
      .triggerEvent('referral.reward', {
        referrerId: referral.referrerId,
        refereeId,
        referralId: saved.id,
        rewardAmount,
        rewardCurrency,
        rewardedAt: saved.rewardedAt,
      })
      .catch((err) =>
        this.logger.error(`Failed to trigger referral webhook: ${err.message}`),
      );
  }
}
