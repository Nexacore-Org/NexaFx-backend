import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { ReferralItemDto } from './dto/referral-item.dto';

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

    await this.notificationsService.create({
      userId: referral.referrerId,
      type: NotificationType.SYSTEM,
      title: 'Referral Reward Earned',
      message: `You earned ${rewardAmount} ${rewardCurrency} from your referral.`,
      metadata: {
        referralId: saved.id,
        refereeId,
        rewardAmount,
        rewardCurrency,
      },
      relatedId: saved.id,
    });

    this.logger.log(
      `Referral reward issued for referrer ${referral.referrerId} and referee ${refereeId}`,
    );
  }
}
