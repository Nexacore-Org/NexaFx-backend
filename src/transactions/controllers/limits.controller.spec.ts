import { Test, TestingModule } from '@nestjs/testing';
import { LimitsController } from './limits.controller';
import { TransactionLimitService } from '../services/transaction-limit.service';
import { UserKycTier } from '../../users/user.entity';

describe('LimitsController', () => {
  let controller: LimitsController;
  let service: TransactionLimitService;

  const mockLimitStatus = {
    tier: UserKycTier.BASIC,
    limits: {
      dailyLimitUsd: 5000,
      monthlyLimitUsd: 50000,
      singleTxLimitUsd: 500,
    },
    usage: {
      todayUsd: 1000,
      monthUsd: 10000,
    },
    remaining: {
      dailyUsd: 4000,
      monthlyUsd: 40000,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LimitsController],
      providers: [
        {
          provide: TransactionLimitService,
          useValue: {
            getUserLimitStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LimitsController>(LimitsController);
    service = module.get<TransactionLimitService>(TransactionLimitService);
  });

  describe('getUserLimits', () => {
    it('should return user limit status', async () => {
      jest.spyOn(service, 'getUserLimitStatus').mockResolvedValue(mockLimitStatus);

      const req = { user: { userId: 'user-123' } };
      const result = await controller.getUserLimits(req);

      expect(result).toEqual(mockLimitStatus);
      expect(service.getUserLimitStatus).toHaveBeenCalledWith('user-123');
    });

    it('should include current KYC tier', async () => {
      jest.spyOn(service, 'getUserLimitStatus').mockResolvedValue(mockLimitStatus);

      const req = { user: { userId: 'user-123' } };
      const result = await controller.getUserLimits(req);

      expect(result.tier).toBe(UserKycTier.BASIC);
    });

    it('should include remaining allowances', async () => {
      jest.spyOn(service, 'getUserLimitStatus').mockResolvedValue(mockLimitStatus);

      const req = { user: { userId: 'user-123' } };
      const result = await controller.getUserLimits(req);

      expect(result.remaining.dailyUsd).toBe(4000);
      expect(result.remaining.monthlyUsd).toBe(40000);
    });

    it('should include current usage', async () => {
      jest.spyOn(service, 'getUserLimitStatus').mockResolvedValue(mockLimitStatus);

      const req = { user: { userId: 'user-123' } };
      const result = await controller.getUserLimits(req);

      expect(result.usage.todayUsd).toBe(1000);
      expect(result.usage.monthUsd).toBe(10000);
    });
  });
});
