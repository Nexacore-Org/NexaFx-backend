import { DataSource, Repository } from 'typeorm';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { User, UserKycTier } from '../../users/user.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';
import { TransactionLimitService } from './transaction-limit.service';

describe('TransactionLimitService', () => {
  let service: TransactionLimitService;
  let queryBuilder: Record<string, jest.Mock>;
  let queryRunner: {
    connect: jest.Mock;
    query: jest.Mock;
    release: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    };
    queryRunner = {
      connect: jest.fn(async () => undefined),
      query: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
    };

    service = new TransactionLimitService(
      {} as unknown as Repository<User>,
      {
        createQueryBuilder: jest.fn(() => queryBuilder),
      } as unknown as Repository<Transaction>,
      {} as unknown as Repository<TransactionLimit>,
      {} as unknown as ExchangeRatesService,
      {
        createQueryRunner: jest.fn(() => queryRunner),
      } as unknown as DataSource,
    );
  });

  it('excludes pending deposit intents without a transaction hash from usage', async () => {
    await (service as any).getUsageInUsd('user-1');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(t.type != :deposit OR t.status != :pending OR t.txHash IS NOT NULL)',
      {
        deposit: TransactionType.DEPOSIT,
        pending: TransactionStatus.PENDING,
      },
    );
    expect(
      queryBuilder.andWhere.mock.calls.filter(([condition]) =>
        condition.includes('t.type != :deposit'),
      ),
    ).toHaveLength(2);
  });

  it('seeds defaults at initialization and not on the limit-check path', async () => {
    const ensureDefaults = jest
      .spyOn(service, 'ensureDefaultLimits')
      .mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(ensureDefaults).toHaveBeenCalledTimes(1);

    ensureDefaults.mockClear();
    jest.spyOn(service, 'getUserLimitStatus').mockResolvedValue({
      tier: UserKycTier.NONE,
      limits: {
        dailyLimitUsd: 100,
        monthlyLimitUsd: 1000,
        singleTxLimitUsd: 100,
      },
      usage: { todayUsd: 0, monthUsd: 0 },
      remaining: { dailyUsd: 100, monthlyUsd: 1000 },
    });

    await service.check('user-1', 10, 'USD');
    expect(ensureDefaults).not.toHaveBeenCalled();
  });

  it('holds a per-user advisory lock through the limit check and transaction operation', async () => {
    const check = jest
      .spyOn(service, 'check')
      .mockResolvedValue(undefined);
    const events: string[] = [];
    queryRunner.query.mockImplementation(async (sql: string) => {
      events.push(sql.includes('pg_advisory_unlock') ? 'unlock' : 'lock');
    });

    await service.withLimitCheck('user-1', 10, 'USD', async () => {
      events.push('operation');
      return 'created';
    });

    expect(check).toHaveBeenCalledWith('user-1', 10, 'USD');
    expect(events).toEqual(['lock', 'operation', 'unlock']);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('releases the advisory lock when a transaction operation fails', async () => {
    jest.spyOn(service, 'check').mockResolvedValue(undefined);

    await expect(
      service.withLimitCheck('user-1', 10, 'USD', async () => {
        throw new Error('transaction failed');
      }),
    ).rejects.toThrow('transaction failed');

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
