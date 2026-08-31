import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RiskService, CustomerProfileInput } from './risk.service';
import {
  CustomerRiskRating,
  RiskLevel,
} from './entities/customer-risk-rating.entity';
import { User, UserKycTier } from '../../users/user.entity';
import { TransactionLimit } from '../../transactions/entities/transaction-limit.entity';
import { createMockRepository } from '../../../test/mocks/factories';

describe('RiskService', () => {
  let service: RiskService;
  let mockRiskRatingRepo: ReturnType<typeof createMockRepository>;
  let mockUserRepo: ReturnType<typeof createMockRepository>;
  let mockTxLimitRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    mockRiskRatingRepo = createMockRepository();
    mockUserRepo = createMockRepository();
    mockTxLimitRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskService,
        {
          provide: getRepositoryToken(CustomerRiskRating),
          useValue: mockRiskRatingRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(TransactionLimit),
          useValue: mockTxLimitRepo,
        },
      ],
    }).compile();

    service = module.get<RiskService>(RiskService);
  });

  describe('calculateRiskScore', () => {
    it('should produce a low risk rating for verified user with low velocity and clean history', () => {
      const profile: CustomerProfileInput = {
        kycTier: UserKycTier.FULL,
        transactionCount30d: 5,
        totalVolumeUsd30d: '1500.00',
        failedAttemptsCount: 0,
        flaggedTxCount: 0,
        countryRisk: 'LOW',
      };

      const result = service.calculateRiskScore(profile);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(25);
      expect(result.riskLevel).toBe(RiskLevel.LOW);
      expect(result.factors.kycTierScore).toBe(5);
      expect(result.factors.countryRiskScore).toBe(2);
    });

    it('should produce a medium risk rating for basic KYC user with moderate activity', () => {
      const profile: CustomerProfileInput = {
        kycTier: UserKycTier.BASIC,
        transactionCount30d: 50,
        totalVolumeUsd30d: '12000.00',
        failedAttemptsCount: 1,
        flaggedTxCount: 0,
        countryRisk: 'MEDIUM',
      };

      const result = service.calculateRiskScore(profile);

      expect(result.score).toBeGreaterThan(25);
      expect(result.score).toBeLessThanOrEqual(50);
      expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
    });

    it('should produce a high or critical risk rating for unverified user with high volume and flagged activity', () => {
      const profile: CustomerProfileInput = {
        kycTier: UserKycTier.UNVERIFIED,
        transactionCount30d: 600,
        totalVolumeUsd30d: '150000.00',
        failedAttemptsCount: 6,
        flaggedTxCount: 2,
        countryRisk: 'HIGH',
      };

      const result = service.calculateRiskScore(profile);

      expect(result.score).toBeGreaterThan(75);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.riskLevel).toBe(RiskLevel.CRITICAL);
    });

    it('should strictly bound risk score between 0 and 100 even with extreme inputs', () => {
      const extremeProfile: CustomerProfileInput = {
        kycTier: UserKycTier.UNVERIFIED,
        transactionCount30d: 999999,
        totalVolumeUsd30d: '999999999.00',
        failedAttemptsCount: 50,
        flaggedTxCount: 50,
        countryRisk: 'HIGH',
      };

      const result = service.calculateRiskScore(extremeProfile);

      expect(result.score).toBe(100);
      expect(result.riskLevel).toBe(RiskLevel.CRITICAL);
    });
  });

  describe('evaluateCustomerRisk', () => {
    const mockUserId = '11111111-2222-3333-4444-555555555555';
    const mockUser = {
      id: mockUserId,
      email: 'customer@example.com',
      kycTier: UserKycTier.BASIC,
    } as User;

    it('should throw NotFoundException if user is not found in database', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.evaluateCustomerRisk(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: mockUserId } });
    });

    it('should evaluate and create new risk rating if none exists', async () => {
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockRiskRatingRepo.findOne.mockResolvedValue(null);
      mockRiskRatingRepo.create.mockImplementation((dto) => ({ ...dto, id: 'rating-1' }));
      mockRiskRatingRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const applyDownstreamSpy = jest.spyOn(service, 'applyDownstreamRiskRestrictions');

      const result = await service.evaluateCustomerRisk(mockUserId, {
        kycTier: UserKycTier.BASIC,
        totalVolumeUsd30d: '1000',
      });

      expect(result).toBeDefined();
      expect(result.userId).toBe(mockUserId);
      expect(mockRiskRatingRepo.create).toHaveBeenCalled();
      expect(mockRiskRatingRepo.save).toHaveBeenCalled();
      expect(applyDownstreamSpy).toHaveBeenCalledWith(mockUserId, result.riskLevel);
    });

    it('should update existing risk rating and trigger downstream limit adjustments on level change', async () => {
      const existingRating: CustomerRiskRating = {
        id: 'rating-1',
        userId: mockUserId,
        score: 15,
        riskLevel: RiskLevel.LOW,
        factors: {},
        lastEvaluatedAt: new Date(Date.now() - 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockRiskRatingRepo.findOne.mockResolvedValue(existingRating);
      mockRiskRatingRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const applyDownstreamSpy = jest.spyOn(service, 'applyDownstreamRiskRestrictions');

      // Provide factors that escalate to HIGH
      const result = await service.evaluateCustomerRisk(mockUserId, {
        kycTier: UserKycTier.UNVERIFIED,
        flaggedTxCount: 2,
        failedAttemptsCount: 5,
        totalVolumeUsd30d: '30000.00',
        countryRisk: 'HIGH',
      });

      expect(result.riskLevel).toBe(RiskLevel.HIGH);
      expect(applyDownstreamSpy).toHaveBeenCalledWith(mockUserId, RiskLevel.HIGH);
      expect(mockRiskRatingRepo.save).toHaveBeenCalled();
    });

    it('should not re-trigger downstream adjustment if risk level did not change', async () => {
      const existingRating: CustomerRiskRating = {
        id: 'rating-1',
        userId: mockUserId,
        score: 15,
        riskLevel: RiskLevel.LOW,
        factors: {},
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findOne.mockResolvedValue({ ...mockUser, kycTier: UserKycTier.FULL });
      mockRiskRatingRepo.findOne.mockResolvedValue(existingRating);
      mockRiskRatingRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const applyDownstreamSpy = jest.spyOn(service, 'applyDownstreamRiskRestrictions');

      const result = await service.evaluateCustomerRisk(mockUserId, {
        kycTier: UserKycTier.FULL,
        totalVolumeUsd30d: '500',
        transactionCount30d: 2,
      });

      expect(result.riskLevel).toBe(RiskLevel.LOW);
      expect(applyDownstreamSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyDownstreamRiskRestrictions', () => {
    it('should query user kyc tier and transaction limits for critical risk', async () => {
      const mockUserId = 'user-critical-1';
      mockUserRepo.findOne.mockResolvedValue({
        id: mockUserId,
        kycTier: UserKycTier.BASIC,
      });
      mockTxLimitRepo.findOne.mockResolvedValue({
        id: 'limit-1',
        tier: UserKycTier.BASIC,
        singleTxLimitUsd: '500.00000000',
      });

      await service.applyDownstreamRiskRestrictions(mockUserId, RiskLevel.CRITICAL);

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: mockUserId } });
      expect(mockTxLimitRepo.findOne).toHaveBeenCalledWith({
        where: { tier: UserKycTier.BASIC },
      });
    });
  });

  describe('getRiskRating', () => {
    it('should retrieve rating for given user ID', async () => {
      const mockRating = { id: 'r-1', userId: 'u-1', score: 20 } as CustomerRiskRating;
      mockRiskRatingRepo.findOne.mockResolvedValue(mockRating);

      const result = await service.getRiskRating('u-1');
      expect(result).toBe(mockRating);
      expect(mockRiskRatingRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    });
  });
});
