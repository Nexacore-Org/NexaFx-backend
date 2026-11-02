import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ReferralsService } from './referrals.service';
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
import { FirebaseService } from '../firebase/firebase.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';

// @nestjs/typeorm, @nestjs/config, and @nestjs/swagger ship as ESM-only in v12
jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const tokenFor = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(tokenFor(entity)),
    getRepositoryToken: tokenFor,
  };
});
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));
jest.mock('../firebase/firebase.service', () => ({
  FirebaseService: class FirebaseService {},
}));
jest.mock('../webhooks/services/webhook.service', () => ({
  WebhookService: class WebhookService {},
}));
jest.mock('../unified-activity-feed/unified-activity-feed.service', () => ({
  UnifiedActivityFeedService: class UnifiedActivityFeedService {},
}));

describe('ReferralsService', () => {
  let service: ReferralsService;
  let referralsRepo: any;
  let usersRepo: any;
  let transactionsRepo: any;
  let ledgerRepo: any;
  let notificationsService: any;
  let webhookService: any;
  let activityFeedService: any;
  let configService: any;
  let dataSource: any;

  beforeEach(async () => {
    referralsRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((input) => ({ id: 'ref-1', ...input })),
      save: jest.fn(async (entity) => ({ id: 'ref-1', ...entity })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    usersRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (entity) => entity),
      update: jest.fn(),
    };

    transactionsRepo = {
      create: jest.fn((input) => ({ id: 'reward-tx-1', ...input })),
      save: jest.fn(async (entity) => ({ id: 'reward-tx-1', ...entity })),
      createQueryBuilder: jest.fn(),
    };

    ledgerRepo = {
      create: jest.fn((input) => input),
      save: jest.fn(async (entities) => entities),
    };

    notificationsService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    webhookService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    activityFeedService = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'REFERRAL_REWARD_AMOUNT') return '15';
        if (key === 'REFERRAL_REWARD_CURRENCY') return 'USDC';
        return undefined;
      }),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === Referral) return referralsRepo;
            if (entity === User) return usersRepo;
            if (entity === Transaction) return transactionsRepo;
            if (entity === LedgerEntry) return ledgerRepo;
            return null;
          },
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        { provide: getRepositoryToken(Referral), useValue: referralsRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionsRepo,
        },
        { provide: getRepositoryToken(LedgerEntry), useValue: ledgerRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: configService },
        { provide: FirebaseService, useValue: { sendToTokens: jest.fn() } },
        { provide: WebhookService, useValue: webhookService },
        {
          provide: UnifiedActivityFeedService,
          useValue: activityFeedService,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPendingReferral', () => {
    it('should reject a self-referral', async () => {
      await expect(
        service.createPendingReferral('user1', 'user1'),
      ).rejects.toThrow(
        new BadRequestException('Users cannot refer themselves'),
      );
    });

    it('should not create a duplicate referral', async () => {
      referralsRepo.findOne.mockResolvedValue({});
      await service.createPendingReferral('user1', 'user2');
      expect(referralsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getReferralStats', () => {
    it('should correctly count completed and pending referrals', async () => {
      const referrals = [
        { status: 'pending' },
        { status: 'rewarded', rewardAmount: '10' },
        { status: 'rewarded', rewardAmount: '15' },
      ];
      usersRepo.findOne.mockResolvedValue({
        referralCode: 'test-code',
      });
      referralsRepo.find.mockResolvedValue(referrals);

      const stats = await service.getReferralStats('user1');
      expect(stats.referralCount).toBe(3);
      expect(stats.pendingRewards).toBe(1);
      expect(stats.totalEarned).toBe(25);
    });
  });

  describe('processReferralReward', () => {
    const makeDepositQueryBuilder = (count: number) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(count),
    });

    it('should be idempotent when referral is already rewarded', async () => {
      const referral = { status: ReferralStatus.REWARDED };
      const user = { id: 'user2', referredBy: 'user1' };
      usersRepo.findOne.mockResolvedValue(user);
      referralsRepo.findOne.mockResolvedValue(referral);

      await service.processReferralReward('user2');
      expect(referralsRepo.save).not.toHaveBeenCalled();
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('does not reward when the referee only has PENDING deposits (#1475)', async () => {
      const qb = makeDepositQueryBuilder(0);
      transactionsRepo.createQueryBuilder.mockReturnValue(qb);

      usersRepo.findOne.mockResolvedValue({
        id: 'referee-1',
        referredBy: 'referrer-1',
      });
      referralsRepo.findOne.mockResolvedValue({
        id: 'ref-1',
        referrerId: 'referrer-1',
        refereeId: 'referee-1',
        status: ReferralStatus.PENDING,
      });

      await service.processReferralReward('referee-1');

      expect(qb.andWhere).toHaveBeenCalledWith('transaction.status = :status', {
        status: TransactionStatus.SUCCESS,
      });
      expect(referralsRepo.save).not.toHaveBeenCalled();
      expect(transactionsRepo.save).not.toHaveBeenCalled();
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('credits the referrer balance once, creates a Transaction + ledger legs, and dispatches notifications after commit (#1475)', async () => {
      const qb = makeDepositQueryBuilder(1);
      transactionsRepo.createQueryBuilder.mockReturnValue(qb);

      const referrer = {
        id: 'referrer-1',
        balances: { USDC: 100 },
        fcmTokens: [],
      };
      const referee = {
        id: 'referee-1',
        referredBy: 'referrer-1',
      };
      const referral = {
        id: 'ref-1',
        referrerId: 'referrer-1',
        refereeId: 'referee-1',
        status: ReferralStatus.PENDING,
        rewardAmount: null,
        rewardCurrency: null,
        rewardedAt: null,
      };

      usersRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === 'referee-1') return referee;
        if (where.id === 'referrer-1') return referrer;
        return null;
      });
      referralsRepo.findOne.mockResolvedValue(referral);

      await service.processReferralReward('referee-1');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(referrer.balances.USDC).toBe(115);
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'referrer-1',
          balances: { USDC: 115 },
        }),
      );
      expect(transactionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'referrer-1',
          type: TransactionType.DEPOSIT,
          amount: '15',
          currency: 'USDC',
          status: TransactionStatus.SUCCESS,
        }),
      );
      expect(transactionsRepo.save).toHaveBeenCalledTimes(1);
      expect(ledgerRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.CREDIT,
          amount: '15',
          currency: 'USDC',
        }),
        expect.objectContaining({
          accountType: LedgerAccountType.PLATFORM_LIABILITY,
          direction: LedgerDirection.DEBIT,
          amount: '15',
          currency: 'USDC',
        }),
      ]);
      expect(notificationsService.dispatch).toHaveBeenCalledTimes(1);
      expect(webhookService.dispatch).toHaveBeenCalledTimes(1);
    });

    it('produces only one reward, one balance credit, and one notification across two concurrent calls (#1475)', async () => {
      const qb = makeDepositQueryBuilder(1);
      transactionsRepo.createQueryBuilder.mockReturnValue(qb);

      const referrer = {
        id: 'referrer-1',
        balances: { USDC: 50 },
        fcmTokens: [],
      };
      const referee = {
        id: 'referee-1',
        referredBy: 'referrer-1',
      };
      const referral = {
        id: 'ref-1',
        referrerId: 'referrer-1',
        refereeId: 'referee-1',
        status: ReferralStatus.PENDING,
        rewardAmount: null,
        rewardCurrency: null,
        rewardedAt: null,
      };

      usersRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === 'referee-1') return referee;
        if (where.id === 'referrer-1') return referrer;
        return null;
      });
      referralsRepo.findOne.mockImplementation(async () => referral);

      await Promise.all([
        service.processReferralReward('referee-1'),
        service.processReferralReward('referee-1'),
      ]);

      expect(referrer.balances.USDC).toBe(65);
      expect(transactionsRepo.save).toHaveBeenCalledTimes(1);
      expect(notificationsService.dispatch).toHaveBeenCalledTimes(1);
      expect(webhookService.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
