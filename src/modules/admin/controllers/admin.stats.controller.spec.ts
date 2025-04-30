

import { Test, TestingModule } from '@nestjs/testing';
import { AdminStatsController } from './admin.stats.controller';
import { AdminStatsService } from '../services/admin.stats.service';
import { OverviewStatsDto } from '../dto/overview-stats.dto';
import { TopCurrencyDto } from '../dto/top-currency.dto';
import { UserStatsDto } from '../dto/user-stats.dto';

describe('AdminStatsController', () => {
  let controller: AdminStatsController;
  let service: AdminStatsService;

  const mockOverviewStats: OverviewStatsDto = {
    totalTransactions: 1250,
    totalRevenue: 75000.50,
    totalUsers: 450,
    recentTransactions: 125,
    lastUpdated: new Date(),
  };

  const mockTopCurrencies: TopCurrencyDto[] = [
    {
      id: 1,
      name: 'Bitcoin',
      code: 'BTC',
      transactionCount: 500,
      totalVolume: 50000.00,
    },
    {
      id: 2,
      name: 'Ethereum',
      code: 'ETH',
      transactionCount: 350,
      totalVolume: 35000.00,
    },
  ];

  const mockUserStats: UserStatsDto = {
    totalUsers: 450,
    newUsers: 50,
    growthRate: 12.5,
    activeUsers: 200,
    lastUpdated: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminStatsController],
      providers: [
        {
          provide: AdminStatsService,
          useValue: {
            getOverviewStats: jest.fn().mockResolvedValue(mockOverviewStats),
            getTopCurrencies: jest.fn().mockResolvedValue(mockTopCurrencies),
            getUserStats: jest.fn().mockResolvedValue(mockUserStats),
          },
        },
      ],
    }).compile();

    controller = module.get<AdminStatsController>(AdminStatsController);
    service = module.get<AdminStatsService>(AdminStatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverviewStats', () => {
    it('should return overview statistics', async () => {
      expect(await controller.getOverviewStats()).toBe(mockOverviewStats);
      expect(service.getOverviewStats).toHaveBeenCalled();
    });
  });

  describe('getTopCurrencies', () => {
    it('should return top currencies', async () => {
      expect(await controller.getTopCurrencies()).toBe(mockTopCurrencies);
      expect(service.getTopCurrencies).toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      expect(await controller.getUserStats()).toBe(mockUserStats);
      expect(service.getUserStats).toHaveBeenCalled();
    });
  });
});