import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VolumeFeeTiersService } from './volume-fee-tiers.service';
import { VolumeFeeTier } from './entities/volume-fee-tier.entity';

describe('VolumeFeeTiersService', () => {
  let service: VolumeFeeTiersService;

  const mockFind = jest.fn();

  const mockRepo = {
    find: mockFind,
  };

  const makeTier = (
    overrides: Partial<VolumeFeeTier> & {
      name: string;
      minVolume30dUsd: string;
    },
  ): VolumeFeeTier => ({
    id: 'uuid',
    sendFeePercent: '0.0010',
    exchangeFeePercent: '0.0015',
    maxSendFee: null,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  });

  const bronzeTier = makeTier({ name: 'Bronze', minVolume30dUsd: '0' });
  const silverTier = makeTier({ name: 'Silver', minVolume30dUsd: '10000' });
  const goldTier = makeTier({ name: 'Gold', minVolume30dUsd: '100000' });
  const platinumTier = makeTier({
    name: 'Platinum',
    minVolume30dUsd: '1000000',
  });

  beforeEach(async () => {
    mockFind.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VolumeFeeTiersService,
        { provide: getRepositoryToken(VolumeFeeTier), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<VolumeFeeTiersService>(VolumeFeeTiersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listActive', () => {
    it('should query for active tiers ordered by minVolume30dUsd ASC', async () => {
      mockFind.mockResolvedValue([bronzeTier, silverTier]);

      const result = await service.listActive();

      expect(mockFind).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { minVolume30dUsd: 'ASC' },
      });
      expect(result).toEqual([bronzeTier, silverTier]);
    });
  });

  describe('resolveTier', () => {
    it('should return null when no active tiers exist', async () => {
      mockFind.mockResolvedValue([]);

      const result = await service.resolveTier(50000);
      expect(result).toBeNull();
    });

    it('should return the lowest tier when volume is below all thresholds', async () => {
      mockFind.mockResolvedValue([bronzeTier, silverTier, goldTier]);

      const result = await service.resolveTier(500);
      expect(result).toEqual(bronzeTier);
    });

    it('should upgrade to Silver when volume exactly crosses 10000', async () => {
      mockFind.mockResolvedValue([bronzeTier, silverTier, goldTier]);

      const result = await service.resolveTier(10000);
      expect(result).toEqual(silverTier);
    });

    it('should upgrade to Gold when volume is 100000 (inclusive boundary)', async () => {
      mockFind.mockResolvedValue([
        bronzeTier,
        silverTier,
        goldTier,
        platinumTier,
      ]);

      const result = await service.resolveTier(100000);
      expect(result).toEqual(goldTier);
    });

    it('should return the highest tier when volume exceeds all thresholds', async () => {
      mockFind.mockResolvedValue([
        bronzeTier,
        silverTier,
        goldTier,
        platinumTier,
      ]);

      const result = await service.resolveTier(9999999);
      expect(result).toEqual(platinumTier);
    });

    it('should handle a single active tier', async () => {
      mockFind.mockResolvedValue([bronzeTier]);

      const result = await service.resolveTier(0);
      expect(result).toEqual(bronzeTier);
    });

    it('should treat boundary values as inclusive (>= comparison)', async () => {
      // Exactly at the Silver threshold — should match Silver, not Bronze
      mockFind.mockResolvedValue([bronzeTier, silverTier]);

      const result = await service.resolveTier(10000);
      expect(result).toEqual(silverTier);
    });
  });

  describe('nextTier', () => {
    it('should return null when no higher tier exists', async () => {
      mockFind.mockResolvedValue([
        bronzeTier,
        silverTier,
        goldTier,
        platinumTier,
      ]);

      const result = await service.nextTier(1000000);
      expect(result).toEqual({ nextTierAt: null, nextTierVolume: null });
    });

    it('should return the next tier above the current volume', async () => {
      mockFind.mockResolvedValue([bronzeTier, silverTier, goldTier]);

      const result = await service.nextTier(5000);
      expect(result).toEqual({ nextTierAt: 'Silver', nextTierVolume: 10000 });
    });

    it('should skip tiers the user already qualifies for', async () => {
      mockFind.mockResolvedValue([
        bronzeTier,
        silverTier,
        goldTier,
        platinumTier,
      ]);

      // User is at Silver level, next is Gold
      const result = await service.nextTier(10000);
      expect(result).toEqual({ nextTierAt: 'Gold', nextTierVolume: 100000 });
    });

    it('should return the first tier when volume is 0', async () => {
      mockFind.mockResolvedValue([bronzeTier, silverTier]);

      const result = await service.nextTier(0);
      // Bronze minVolume is 0, so 0 > 0 is false. Next is Silver.
      expect(result).toEqual({ nextTierAt: 'Silver', nextTierVolume: 10000 });
    });

    it('should handle a single tier — always returns null', async () => {
      mockFind.mockResolvedValue([bronzeTier]);

      const result = await service.nextTier(0);
      expect(result).toEqual({ nextTierAt: null, nextTierVolume: null });
    });
  });
});
