import { Test, TestingModule } from '@nestjs/testing';
import { ReferralsService } from './referrals.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Referral } from './entities/referral.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { BadRequestException } from '@nestjs/common';

describe('ReferralsService', () => {
  let service: ReferralsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        {
          provide: getRepositoryToken(Referral),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            dispatch: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: FirebaseService,
          useValue: {},
        },
        {
          provide: WebhookService,
          useValue: {},
        },
        {
          provide: UnifiedActivityFeedService,
          useValue: {
            append: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPendingReferral', () => {
    it('should reject a self-referral', async () => {
      await expect(service.createPendingReferral('user1', 'user1')).rejects.toThrow(
        new BadRequestException('Users cannot refer themselves'),
      );
    });

    it('should not create a duplicate referral', async () => {
      const referralsRepo = (service as any).referralsRepository;
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
      (service as any).usersRepository.findOne.mockResolvedValue({ referralCode: 'test-code' });
      (service as any).referralsRepository.find.mockResolvedValue(referrals);

      const stats = await service.getReferralStats('user1');
      expect(stats.referralCount).toBe(3);
      expect(stats.pendingRewards).toBe(1);
      expect(stats.totalEarned).toBe(25);
    });
  });

  describe('processReferralReward', () => {
    it('should be idempotent', async () => {
      const referral = { status: 'rewarded' };
      const user = { referredBy: 'user1' };
      (service as any).usersRepository.findOne.mockResolvedValue(user);
      (service as any).referralsRepository.findOne.mockResolvedValue(referral);

      await service.processReferralReward('user2');
      expect((service as any).referralsRepository.save).not.toHaveBeenCalled();
    });
  });
});