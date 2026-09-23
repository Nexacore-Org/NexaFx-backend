import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { SavingsRecommendationsService } from './savings-recommendations.service';
import {
  SavingsRecommendation,
  RecommendationType,
} from './entities/savings-recommendation.entity';
import { createMockRepository } from '../../../test/mocks/factories';

describe('SavingsRecommendationsService', () => {
  let service: SavingsRecommendationsService;
  let recommendationRepo: any;

  beforeEach(async () => {
    recommendationRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingsRecommendationsService,
        {
          provide: getRepositoryToken(SavingsRecommendation),
          useValue: recommendationRepo,
        },
      ],
    }).compile();

    service = module.get<SavingsRecommendationsService>(
      SavingsRecommendationsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeVaultContribution', () => {
    it('returns null when the average daily balance is at or below 500', async () => {
      const result = await service.analyzeVaultContribution({
        id: 'user-1',
        avgDailyBalanceXlm: 500,
      });
      expect(result).toBeNull();
      expect(recommendationRepo.save).not.toHaveBeenCalled();
    });

    it('generates a VAULT_CONTRIBUTION recommendation when balance exceeds 500', async () => {
      const saved = {
        id: 'rec-1',
        userId: 'user-1',
        type: RecommendationType.VAULT_CONTRIBUTION,
        potentialSavingsXlm: '120.00000000',
      };
      recommendationRepo.create.mockImplementation((e) => e);
      recommendationRepo.save.mockResolvedValue(saved);

      const result = await service.analyzeVaultContribution({
        id: 'user-1',
        avgDailyBalanceXlm: 600,
      });

      expect(result).toEqual(saved);
      const created = recommendationRepo.create.mock.calls[0][0];
      expect(created.type).toBe(RecommendationType.VAULT_CONTRIBUTION);
      expect(created.userId).toBe('user-1');
      // 20% of 600 = 120, rendered with 8 decimal places.
      expect(created.potentialSavingsXlm).toBe('120.00000000');
      // Decimal.js-aware check rather than floating point equality.
      expect(new Decimal(created.potentialSavingsXlm).eq(120)).toBe(true);
      expect(created.actionDeepLink).toBe(
        '/vaults/deposit?amount=120.00000000',
      );
      expect(created.body).toContain('600');
      expect(created.isActedOn).toBeUndefined();
      expect(recommendationRepo.save).toHaveBeenCalled();
    });

    it('uses a zero baseline when no balance is provided', async () => {
      const result = await service.analyzeVaultContribution({ id: 'user-1' });
      expect(result).toBeNull();
    });
  });

  describe('placeholder analyses', () => {
    it('returns null for recurring setup when criteria are not met', async () => {
      expect(await service.analyzeRecurringSetup({ id: 'user-1' })).toBeNull();
    });

    it('returns null for vault duration analysis', async () => {
      expect(await service.analyzeVaultDuration({ id: 'user-1' })).toBeNull();
    });

    it('returns null for topup reduction analysis', async () => {
      expect(await service.analyzeTopupReduction({ id: 'user-1' })).toBeNull();
    });
  });

  describe('weeklyRecommendation', () => {
    it('runs without producing output or throwing', async () => {
      const result = await service.weeklyRecommendation();
      expect(result).toBeUndefined();
    });
  });

  describe('getRecommendations', () => {
    it('queries only non-acted-on recommendations for the user', async () => {
      const recs = [{ id: 'rec-1' }];
      recommendationRepo.find.mockResolvedValue(recs);

      const result = await service.getRecommendations('user-1');

      const [options] = recommendationRepo.find.mock.calls[0];
      expect(options.where).toEqual(
        expect.objectContaining({ userId: 'user-1', isActedOn: false }),
      );
      expect(options.where.expiresAt).toBeDefined();
      expect(result).toEqual(recs);
    });
  });

  describe('markActedOn', () => {
    it('throws NotFoundException when the recommendation does not belong to the user', async () => {
      recommendationRepo.findOne.mockResolvedValue(null);

      await expect(service.markActedOn('rec-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(recommendationRepo.save).not.toHaveBeenCalled();
    });

    it('marks the recommendation as acted on and persists it', async () => {
      const rec = { id: 'rec-1', userId: 'user-1', isActedOn: false };
      recommendationRepo.findOne.mockResolvedValue(rec);
      recommendationRepo.save.mockResolvedValue({ ...rec, isActedOn: true });

      const result = await service.markActedOn('rec-1', 'user-1');

      expect(recommendationRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'rec-1', userId: 'user-1' },
      });
      expect(rec.isActedOn).toBe(true);
      expect(recommendationRepo.save).toHaveBeenCalledWith(rec);
      expect(result.isActedOn).toBe(true);
    });
  });

  describe('deleteExpired', () => {
    it('deletes recommendations whose expiry is in the past', async () => {
      await service.deleteExpired();

      expect(recommendationRepo.delete).toHaveBeenCalledTimes(1);
      const [criteria] = recommendationRepo.delete.mock.calls[0];
      expect(criteria.expiresAt).toBeDefined();
    });
  });
});
