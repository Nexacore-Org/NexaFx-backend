// @nestjs-modules/ioredis is referenced by SimulatorService but is not a declared
// dependency of this repo (pre-existing defect); provide a no-op decorator so the
// service module can be loaded under test.
jest.mock(
  '@nestjs-modules/ioredis',
  () => ({
    InjectRedis: jest.fn(() => jest.fn()),
  }),
  { virtual: true },
);

import { SimulatorService } from './simulator.service';
import { createMockRedisClient } from '../../../test/mocks/factories';

describe('SimulatorService', () => {
  let service: SimulatorService;
  let snapshotRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let walletRepo: { findOne: jest.Mock };
  let redis: ReturnType<typeof createMockRedisClient>;

  const mockQueryBuilder = (getOneValue: unknown) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(getOneValue),
  });

  beforeEach(() => {
    snapshotRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder(null)),
    };
    walletRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    redis = createMockRedisClient();

    service = new SimulatorService(
      snapshotRepo as any,
      walletRepo as any,
      redis as any,
    );
  });

  describe('targetPriceScenario', () => {
    it('computes current and projected values plus change percentage', async () => {
      walletRepo.findOne.mockResolvedValue({ balance: '100' });
      snapshotRepo.findOne.mockResolvedValue({ rate: '1400' });

      const result = await service.targetPriceScenario(
        'user-1',
        1500,
        'USD',
        'NGN',
      );

      expect(result.currentRate).toBe(1400);
      expect(result.targetRate).toBe(1500);
      expect(result.currentValueTo).toBe(100 * 1400);
      expect(result.projectedValueTo).toBe(100 * 1500);
      expect(result.changePct).toBeCloseTo(((1500 - 1400) / 1400) * 100, 5);
      expect(result.disclaimer).toContain('hypothetical simulation');
    });

    it('returns a clearly-labeled simulated result that cannot be mistaken for a real transaction', async () => {
      const result = await service.targetPriceScenario(
        'user-1',
        1500,
        'USD',
        'NGN',
      );

      expect(result.disclaimer).toBeDefined();
      expect(result.disclaimer.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('txHash');
      expect(result).not.toHaveProperty('submitted');
      expect(result).not.toHaveProperty('reference');
    });

    it('treats a missing wallet as a zero balance', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      snapshotRepo.findOne.mockResolvedValue({ rate: '1400' });

      const result = await service.targetPriceScenario(
        'user-1',
        1500,
        'USD',
        'NGN',
      );

      expect(result.currentValueTo).toBe(0);
      expect(result.projectedValueTo).toBe(0);
    });

    it('returns changePct 0 when there is no current rate snapshot', async () => {
      walletRepo.findOne.mockResolvedValue({ balance: '100' });
      snapshotRepo.findOne.mockResolvedValue(null);

      const result = await service.targetPriceScenario(
        'user-1',
        1500,
        'USD',
        'NGN',
      );

      expect(result.currentRate).toBe(0);
      expect(result.changePct).toBe(0);
    });

    it('serves a cached result without touching the database', async () => {
      const cached = {
        currentRate: 1400,
        targetRate: 1500,
        currentValueTo: 140000,
        projectedValueTo: 150000,
        changePct: 7.142857142857142,
        disclaimer: 'cached',
      };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.targetPriceScenario(
        'user-1',
        1500,
        'USD',
        'NGN',
      );

      expect(result).toEqual(cached);
      expect(walletRepo.findOne).not.toHaveBeenCalled();
      expect(snapshotRepo.findOne).not.toHaveBeenCalled();
    });

    it('caches the computed result with a one-hour TTL', async () => {
      walletRepo.findOne.mockResolvedValue({ balance: '100' });
      snapshotRepo.findOne.mockResolvedValue({ rate: '1400' });

      await service.targetPriceScenario('user-1', 1500, 'USD', 'NGN');

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('simulator:target:'),
        expect.any(String),
        'EX',
        3600,
      );
    });
  });

  describe('historicalBacktest', () => {
    it('computes purchase cost, current value, and gain/loss', async () => {
      // First findOne call (ASC) is the historical purchase rate;
      // second (DESC) is the current rate.
      snapshotRepo.findOne
        .mockResolvedValueOnce({ rate: '1200' })
        .mockResolvedValueOnce({ rate: '1400' });

      const result = await service.historicalBacktest('USD', 'NGN', 30, 100);

      expect(result.purchaseRate).toBe(1200);
      expect(result.currentRate).toBe(1400);
      expect(result.purchaseCost).toBe(100 * 1200);
      expect(result.currentValue).toBe(100 * 1400);
      expect(result.gainLoss).toBe(100 * 1400 - 100 * 1200);
      expect(result.gainLossPct).toBeCloseTo((20000 / 120000) * 100, 5);
      expect(result.disclaimer).toContain('hypothetical simulation');
    });

    it('returns gainLossPct 0 when no historical rate exists', async () => {
      snapshotRepo.findOne.mockResolvedValue(null);

      const result = await service.historicalBacktest('USD', 'NGN', 30, 100);

      expect(result.purchaseRate).toBe(0);
      expect(result.gainLossPct).toBe(0);
    });

    it('serves a cached result and caches new computations', async () => {
      const cached = { purchaseRate: 1200, disclaimer: 'cached' };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.historicalBacktest('USD', 'NGN', 30, 100);

      expect(result).toEqual(cached);
      expect(snapshotRepo.findOne).not.toHaveBeenCalled();

      redis.get.mockResolvedValue(null);
      snapshotRepo.findOne
        .mockResolvedValueOnce({ rate: '1200' })
        .mockResolvedValueOnce({ rate: '1400' });
      await service.historicalBacktest('USD', 'NGN', 30, 100);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('simulator:backtest:'),
        expect.any(String),
        'EX',
        3600,
      );
    });
  });

  describe('dcaCalculator', () => {
    it('accumulates units across monthly snapshots and values them at the current rate', async () => {
      snapshotRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ rate: '1400' }),
      );
      // Current-rate lookup (DESC) after the loop.
      snapshotRepo.findOne.mockResolvedValue({ rate: '1450' });

      const result = await service.dcaCalculator(
        'user-1',
        100,
        'USD',
        'NGN',
        3,
      );

      expect(result.totalInvested).toBe(300);
      expect(result.monthlyRates).toHaveLength(3);
      // totalUnits = (100/1400) * 3, currentValue = totalUnits * 1450
      expect(result.currentValue).toBeCloseTo((100 / 1400) * 3 * 1450, 5);
      expect(result.gainLoss).toBeCloseTo((100 / 1400) * 3 * 1450 - 300, 5);
      expect(result.disclaimer).toContain('hypothetical simulation');
    });

    it('labels each monthly bucket with a YYYY-MM key', async () => {
      snapshotRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ rate: '1400' }),
      );
      snapshotRepo.findOne.mockResolvedValue({ rate: '1450' });

      const result = await service.dcaCalculator(
        'user-1',
        100,
        'USD',
        'NGN',
        2,
      );

      expect(result.monthlyRates.length).toBe(2);
      for (const entry of result.monthlyRates) {
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
        expect(entry.rate).toBe(1400);
      }
    });

    it('accumulates no units when monthly rates are unavailable', async () => {
      snapshotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null));
      snapshotRepo.findOne.mockResolvedValue(null);

      const result = await service.dcaCalculator(
        'user-1',
        100,
        'USD',
        'NGN',
        3,
      );

      expect(result.currentValue).toBe(0);
      expect(result.gainLoss).toBe(-300);
    });

    it('serves cached results without querying snapshots', async () => {
      const cached = { totalInvested: 300, disclaimer: 'cached' };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.dcaCalculator(
        'user-1',
        100,
        'USD',
        'NGN',
        3,
      );

      expect(result).toEqual(cached);
      expect(snapshotRepo.createQueryBuilder).not.toHaveBeenCalled();

      redis.get.mockResolvedValue(null);
      snapshotRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ rate: '1400' }),
      );
      snapshotRepo.findOne.mockResolvedValue({ rate: '1450' });
      await service.dcaCalculator('user-1', 100, 'USD', 'NGN', 3);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('simulator:dca:'),
        expect.any(String),
        'EX',
        3600,
      );
    });
  });
});
