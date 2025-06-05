
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminStatsService } from './admin.stats.service';
import { Transaction } from 'src/transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Currency } from 'src/currencies/entities/currency.entity';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let transactionRepository: MockRepository<Transaction>;
  let userRepository: MockRepository<User>;
  let currencyRepository: MockRepository<Currency>;

  beforeEach(async () => {
    const createQueryBuilderMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getCount: jest.fn(),
    };

    transactionRepository = {
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock),
    };

    userRepository = {
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock),
    };

    currencyRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(Currency),
          useValue: currencyRepository,
        },
      ],
    }).compile();

    service = module.get<AdminStatsService>(AdminStatsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverviewStats', () => {
    it('should return overview statistics', async () => {
      transactionRepository.count.mockResolvedValue(1250);
      userRepository.count.mockResolvedValue(450);
      
      const queryBuilder = transactionRepository.createQueryBuilder();
      queryBuilder.getRawOne.mockResolvedValue({ totalRevenue: 75000.50 });
      queryBuilder.getCount.mockResolvedValue(125);

      const result = await service.getOverviewStats();

      expect(result).toEqual({
        totalTransactions: 1250,
        totalRevenue: 75000.50,
        totalUsers: 450,
        recentTransactions: 125,
        lastUpdated: expect.any(Date),
      });
    });
  });

  describe('getTopCurrencies', () => {
    it('should return top currencies', async () => {
      const mockRawData = [
        {
          currencyId: 1,
          currencyName: 'Bitcoin',
          currencyCode: 'BTC',
          transactionCount: '500',
          totalVolume: '50000.00',
        },
        {
          currencyId: 2,
          currencyName: 'Ethereum',
          currencyCode: 'ETH',
          transactionCount: '350',
          totalVolume: '35000.00',
        },
      ];

      const queryBuilder = transactionRepository.createQueryBuilder();
      queryBuilder.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getTopCurrencies();

      expect(result).toEqual([
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
      ]);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      userRepository.count.mockResolvedValue(450);
      
      const queryBuilder = userRepository.createQueryBuilder();
      queryBuilder.getCount
        .mockResolvedValueOnce(50)   // newUsers
        .mockResolvedValueOnce(40);  // previousMonthUsers
      
      const transactionQueryBuilder = transactionRepository.createQueryBuilder();
      transactionQueryBuilder.getRawOne.mockResolvedValue({ activeUserCount: '200' });

      const result = await service.getUserStats();

      expect(result).toEqual({
        totalUsers: 450,
        newUsers: 50,
        growthRate: 25, // (50-40)/40 * 100
        activeUsers: 200,
        lastUpdated: expect.any(Date),
      });
    });
  });
});