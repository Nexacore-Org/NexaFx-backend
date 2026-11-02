jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const noop = () => () => {};
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    Entity: noop,
    PrimaryGeneratedColumn: noop,
    Column: noop,
    CreateDateColumn: noop,
    UpdateDateColumn: noop,
    ManyToOne: noop,
    OneToMany: noop,
    JoinColumn: noop,
    Index: noop,
  };
});

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => {};
  return {
    ApiProperty: noop,
    ApiPropertyOptional: noop,
    ApiTags: noop,
    ApiBearerAuth: noop,
    ApiOperation: noop,
    ApiResponse: noop,
    ApiQuery: noop,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
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

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferralsService, maskEmail } from './referrals.service';
import { Referral } from './entities/referral.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FirebaseService } from '../firebase/firebase.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';

describe('ReferralsService (#1474)', () => {
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
            findAndCount: jest.fn(),
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

  describe('maskEmail', () => {
    it('masks local and domain parts while keeping first characters and TLD', () => {
      expect(maskEmail('john.doe@domain.com')).toBe('j***@d***.com');
      expect(maskEmail('alice@example.org')).toBe('a***@e***.org');
      expect(maskEmail(null)).toBe('***');
    });
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
      const referralsRepo = (service as any).referralsRepository;
      referralsRepo.findOne.mockResolvedValue({});
      await service.createPendingReferral('user1', 'user2');
      expect(referralsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getReferralStats', () => {
    it('returns referralCount, pendingRewards, and totalEarned grouped by rewardCurrency', async () => {
      const referrals = [
        { status: 'pending' },
        { status: 'rewarded', rewardAmount: '10', rewardCurrency: 'USD' },
        { status: 'rewarded', rewardAmount: '15.5', rewardCurrency: 'USD' },
        { status: 'rewarded', rewardAmount: '50', rewardCurrency: 'XLM' },
      ];
      (service as any).usersRepository.findOne.mockResolvedValue({
        referralCode: 'test-code',
      });
      (service as any).referralsRepository.find.mockResolvedValue(referrals);

      const stats = await service.getReferralStats('user1');
      expect(stats.referralCode).toBe('test-code');
      expect(stats.referralCount).toBe(4);
      expect(stats.pendingRewards).toBe(1);
      expect(stats.totalEarned).toEqual({
        USD: 25.5,
        XLM: 50,
      });
      expect(stats.earningsByCurrency).toEqual({
        USD: 25.5,
        XLM: 50,
      });
    });
  });

  describe('getUserReferrals', () => {
    it('returns paginated ReferralItemDto rows with maskedEmail and firstName only (no raw email or lastName)', async () => {
      const createdAt = new Date('2026-10-18T10:00:00.000Z');
      const rows = [
        {
          id: 'ref-1',
          status: 'pending',
          rewardAmount: null,
          rewardCurrency: null,
          rewardedAt: null,
          createdAt,
          referee: {
            id: 'referee-1',
            email: 'secret.referee@example.com',
            firstName: 'Jane',
            lastName: 'SecretLastName',
            createdAt,
          },
        },
      ];
      (service as any).referralsRepository.findAndCount.mockResolvedValue([
        rows,
        1,
      ]);

      const result = await service.getUserReferrals('user1', 1, 10);

      expect(
        (service as any).referralsRepository.findAndCount,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { referrerId: 'user1' },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: 'ref-1',
        maskedEmail: 's***@e***.com',
        firstName: 'Jane',
        status: 'pending',
        rewardAmount: null,
        rewardCurrency: null,
        rewardedAt: null,
        createdAt,
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('secret.referee@example.com');
      expect(serialized).not.toContain('SecretLastName');
      expect(result.data[0]).not.toHaveProperty('email');
      expect(result.data[0]).not.toHaveProperty('lastName');
      expect(result.data[0]).not.toHaveProperty('referee');
    });

    it('rejects limit > 100 or page < 1 with BadRequestException', async () => {
      await expect(service.getUserReferrals('user1', 1, 101)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getUserReferrals('user1', 0, 20)).rejects.toThrow(
        BadRequestException,
      );
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
