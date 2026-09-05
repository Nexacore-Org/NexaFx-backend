// @nestjs-modules/ioredis is referenced by SimulatorService (imported transitively
// via the controller) but is not a declared dependency of this repo (pre-existing
// defect); provide a no-op decorator so the module can be loaded under test.
jest.mock(
  '@nestjs-modules/ioredis',
  () => ({
    InjectRedis: jest.fn(() => jest.fn()),
  }),
  { virtual: true },
);

import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';

describe('SimulatorController', () => {
  let controller: SimulatorController;
  let simulatorService: {
    targetPriceScenario: jest.Mock;
    historicalBacktest: jest.Mock;
    dcaCalculator: jest.Mock;
  };

  beforeEach(() => {
    simulatorService = {
      targetPriceScenario: jest.fn(),
      historicalBacktest: jest.fn(),
      dcaCalculator: jest.fn(),
    };
    controller = new SimulatorController(
      simulatorService as unknown as SimulatorService,
    );
  });

  describe('targetPriceScenario', () => {
    it('forwards the authenticated user and body to the service', async () => {
      simulatorService.targetPriceScenario.mockResolvedValue({
        currentValueTo: 100,
      });

      const result = await controller.targetPriceScenario(
        { user: { id: 'user-1' } },
        { targetRate: 1500, currency: 'USD', toCurrency: 'NGN' },
      );

      expect(simulatorService.targetPriceScenario).toHaveBeenCalledWith(
        'user-1',
        1500,
        'USD',
        'NGN',
      );
      expect(result).toEqual({ currentValueTo: 100 });
    });
  });

  describe('historicalBacktest', () => {
    it('forwards the body to the service', async () => {
      simulatorService.historicalBacktest.mockResolvedValue({
        gainLoss: 200,
      });

      const result = await controller.historicalBacktest({
        currency: 'USD',
        toCurrency: 'NGN',
        daysAgo: 30,
        amount: 100,
      });

      expect(simulatorService.historicalBacktest).toHaveBeenCalledWith(
        'USD',
        'NGN',
        30,
        100,
      );
      expect(result).toEqual({ gainLoss: 200 });
    });
  });

  describe('dcaCalculator', () => {
    it('forwards the authenticated user and body to the service', async () => {
      simulatorService.dcaCalculator.mockResolvedValue({
        totalInvested: 300,
      });

      const result = await controller.dcaCalculator(
        { user: { id: 'user-1' } },
        { monthlyAmount: 100, currency: 'USD', toCurrency: 'NGN', months: 3 },
      );

      expect(simulatorService.dcaCalculator).toHaveBeenCalledWith(
        'user-1',
        100,
        'USD',
        'NGN',
        3,
      );
      expect(result).toEqual({ totalInvested: 300 });
    });
  });

  describe('getUsageStats', () => {
    it('returns the placeholder usage stats', async () => {
      await expect(controller.getUsageStats()).resolves.toEqual({
        totalSimulations: 0,
        uniqueUsers: 0,
        popularCurrencyPair: null,
      });
    });
  });
});
