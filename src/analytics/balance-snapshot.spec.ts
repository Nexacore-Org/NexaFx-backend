// Mock ESM-only @nestjs/typeorm and @nestjs/config
jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
  };
});
jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get() {
      return null;
    }
  },
}));
jest.mock('../exchange-rates/exchange-rates.service', () => ({
  ExchangeRatesService: class MockExchangeRatesService {
    getRate() {
      return 1;
    }
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import { ReportExportJob } from './entities/report-export-job.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

describe('BalanceSnapshot Idempotency and Performance (#1522)', () => {
  let service: AnalyticsService;
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;

  beforeEach(async () => {
    dataSource = {
      query: jest.fn(),
    };
    usersService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: 'TransactionRepository',
          useValue: { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: 'TransactionCategoryRepository',
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: 'BalanceSnapshotRepository',
          useValue: { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: 'ReportExportJobRepository',
          useValue: { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), update: jest.fn() },
        },
        {
          provide: 'UserRepository',
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: ExchangeRatesService,
          useValue: { getRate: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('recordBalanceSnapshotsForAllUsers', () => {
    it('issues a single O(1) query with ON CONFLICT DO NOTHING regardless of user count', async () => {
      dataSource.query.mockResolvedValueOnce([{ id: 'snap-1' }, { id: 'snap-2' }]);

      const count = await service.recordBalanceSnapshotsForAllUsers();

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const queryCall = dataSource.query.mock.calls[0][0];
      expect(queryCall).toContain('INSERT INTO balance_snapshots');
      expect(queryCall).toContain('SELECT');
      expect(queryCall).toContain('ON CONFLICT (user_id, snapshot_date) DO NOTHING');
      expect(queryCall).toContain('RETURNING id');
      expect(count).toBe(2);
    });

    it('is idempotent when run twice on the same day (second run returns 0 inserted rows)', async () => {
      // First run: inserts 3 rows
      dataSource.query.mockResolvedValueOnce([{ id: 'snap-1' }, { id: 'snap-2' }, { id: 'snap-3' }]);
      const firstRunCount = await service.recordBalanceSnapshotsForAllUsers();
      expect(firstRunCount).toBe(3);

      // Second run on same day: ON CONFLICT DO NOTHING prevents duplicates, returns empty array
      dataSource.query.mockResolvedValueOnce([]);
      const secondRunCount = await service.recordBalanceSnapshotsForAllUsers();
      expect(secondRunCount).toBe(0);

      // In total, only 2 queries were executed (O(1) per run, no N+1 queries)
      expect(dataSource.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordBalanceSnapshot', () => {
    it('uses ON CONFLICT DO NOTHING to prevent duplicate user snapshots', async () => {
      usersService.findById.mockResolvedValueOnce({
        id: 'user-1',
        balances: { USD: 100, EUR: 50 },
      } as any);
      dataSource.query.mockResolvedValueOnce([]);

      await service.recordBalanceSnapshot('user-1');

      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO balance_snapshots');
      expect(sql).toContain('ON CONFLICT (user_id, snapshot_date) DO NOTHING');
      expect(params[0]).toBe('user-1');
      expect(params[1]).toBe(JSON.stringify({ USD: 100, EUR: 50 }));
    });

    it('returns early when user does not exist', async () => {
      usersService.findById.mockResolvedValueOnce(null);

      await service.recordBalanceSnapshot('non-existent');

      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });
});
