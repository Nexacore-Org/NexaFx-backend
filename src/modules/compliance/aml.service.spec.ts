import { Test, TestingModule } from '@nestjs/testing';

jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
  };
});

jest.mock('@nestjs/bullmq', () => {
  const { Inject } = require('@nestjs/common');
  const getQueueToken = (name: string) => `BullQueue_${name}`;
  return {
    InjectQueue: (name: string) => Inject(getQueueToken(name)),
    getQueueToken,
    Processor: () => () => undefined,
    WorkerHost: class WorkerHost {},
  };
});

import { AmlService } from './aml.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Transaction,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { AmlConfig } from './entities/aml-config.entity';
import {
  ComplianceFlagService,
  DEFAULT_AML_RULE_WEIGHTS,
} from './compliance-flag.service';
import { ComplianceFlag } from './entities/compliance-flag.entity';
import { Sar } from './entities/sar.entity';
import { AmlCheckProcessor } from './processors/aml-check.processor';
import { getQueueToken } from '@nestjs/bullmq';

const mockTransactionRepo = {
  count: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockConfigRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockFlagService = {
  createFlag: jest.fn(),
};

const mockAmlQueue = {
  add: jest.fn(),
};

describe('AmlService & ComplianceFlagService (#1496)', () => {
  let service: AmlService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmlService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(AmlConfig),
          useValue: mockConfigRepo,
        },
        {
          provide: ComplianceFlagService,
          useValue: mockFlagService,
        },
        {
          provide: getQueueToken('aml-check'),
          useValue: mockAmlQueue,
        },
      ],
    }).compile();

    service = module.get<AmlService>(AmlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueue', () => {
    it('enqueues with deterministic jobId aml-<transactionId> so duplicate enqueues are deduplicated by BullMQ', async () => {
      await service.enqueue('tx-123');
      await service.enqueue('tx-123');

      expect(mockAmlQueue.add).toHaveBeenCalledTimes(2);
      expect(mockAmlQueue.add).toHaveBeenNthCalledWith(
        1,
        'check',
        { transactionId: 'tx-123' },
        { jobId: 'aml-tx-123' },
      );
      expect(mockAmlQueue.add).toHaveBeenNthCalledWith(
        2,
        'check',
        { transactionId: 'tx-123' },
        { jobId: 'aml-tx-123' },
      );
    });
  });

  describe('evaluate', () => {
    it('should flag a large transaction', async () => {
      const config = { largeTxThresholdUsd: 10000 };
      const transaction = {
        id: 'tx-id',
        amount: '15000.00',
        userId: 'user-id',
      };
      mockConfigRepo.findOne.mockResolvedValue(config);
      mockUserRepo.findOne.mockResolvedValue({ createdAt: new Date() });
      mockTransactionRepo.count.mockResolvedValue(0);
      mockTransactionRepo.findOne.mockResolvedValue(null);
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      const result = await service.evaluate(transaction as any);
      expect(result).toEqual(['large_transaction']);
    });

    it('should evaluate all rules and return multiple matched rules instead of stopping at the first', async () => {
      const config = {
        largeTxThresholdUsd: 10000,
        newAccountAgeDays: 7,
        newAccountLargeTxThresholdUsd: 5000,
        rapidMovementWindowMinutes: 60,
        rapidMovementCount: 5,
        roundTripWindowMinutes: 30,
        structuringCount: 3,
        structuringWindowHours: 24,
      };
      const transaction = {
        id: 'tx-multi',
        amount: '15000.00',
        userId: 'user-id',
        type: TransactionType.WITHDRAW,
        createdAt: new Date(),
      };
      mockConfigRepo.findOne.mockResolvedValue(config);
      // 1-day-old account triggers new_account_large_tx as well as large_transaction
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      // 6 recent transactions triggers rapid_movement
      mockTransactionRepo.count.mockResolvedValue(6);
      mockTransactionRepo.findOne.mockResolvedValue(null);
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      const result = await service.evaluate(transaction as any);
      expect(result).toEqual([
        'large_transaction',
        'new_account_large_tx',
        'rapid_movement',
      ]);
    });

    it('should not flag a normal transaction', async () => {
      const config = {
        largeTxThresholdUsd: 10000,
        newAccountAgeDays: 30,
        newAccountLargeTxThresholdUsd: 1000,
        rapidMovementWindowMinutes: 60,
        rapidMovementCount: 10,
        roundTripWindowMinutes: 60,
        structuringCount: 3,
        structuringWindowHours: 24,
      };
      const transaction = {
        id: 'tx-id',
        amount: '500.00',
        userId: 'user-id',
        createdAt: new Date(),
      };
      mockConfigRepo.findOne.mockResolvedValue(config);
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      });
      mockTransactionRepo.count.mockResolvedValue(1);
      mockTransactionRepo.findOne.mockResolvedValue(null);
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      const result = await service.evaluate(transaction as any);
      expect(result).toEqual([]);
    });
  });

  describe('ComplianceFlagService & AmlCheckProcessor', () => {
    let flagService: ComplianceFlagService;
    let processor: AmlCheckProcessor;
    let storedFlags: any[];
    let flagRepo: {
      create: jest.Mock;
      save: jest.Mock;
      findOne: jest.Mock;
      count: jest.Mock;
      find: jest.Mock;
    };
    let sarRepo: {
      count: jest.Mock;
    };

    beforeEach(async () => {
      storedFlags = [];
      flagRepo = {
        create: jest.fn((dto) => ({ ...dto })),
        save: jest.fn(async (flag) => {
          const saved = {
            id: `flag-${storedFlags.length + 1}`,
            createdAt: new Date(),
            ...flag,
          };
          storedFlags.push(saved);
          return saved;
        }),
        findOne: jest.fn(async ({ where }: any) => {
          return (
            storedFlags.find(
              (f) =>
                f.transactionId === where?.transactionId &&
                f.rule === where?.rule,
            ) ?? null
          );
        }),
        count: jest.fn(async () => storedFlags.length),
        find: jest.fn(async () => storedFlags),
      };
      sarRepo = {
        count: jest.fn().mockResolvedValue(0),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ComplianceFlagService,
          AmlService,
          AmlCheckProcessor,
          {
            provide: getRepositoryToken(ComplianceFlag),
            useValue: flagRepo,
          },
          {
            provide: getRepositoryToken(Sar),
            useValue: sarRepo,
          },
          {
            provide: getRepositoryToken(User),
            useValue: mockUserRepo,
          },
          {
            provide: getRepositoryToken(Transaction),
            useValue: mockTransactionRepo,
          },
          {
            provide: getRepositoryToken(AmlConfig),
            useValue: mockConfigRepo,
          },
          {
            provide: getQueueToken('aml-check'),
            useValue: mockAmlQueue,
          },
        ],
      }).compile();

      flagService = module.get(ComplianceFlagService);
      processor = module.get(AmlCheckProcessor);
    });

    it('assigns non-zero per-rule riskScore and supports configurable rule weights', async () => {
      const tx = { id: 'tx-score-1', userId: 'user-1', amount: '20000' } as any;

      const flag1 = await flagService.createFlag(tx, 'large_transaction');
      expect(flag1.riskScore).toBe(DEFAULT_AML_RULE_WEIGHTS.large_transaction);
      expect(flag1.riskScore).toBeGreaterThan(0);

      flagService.setRuleWeights({ structuring: 75 });
      const flag2 = await flagService.createFlag(tx, 'structuring');
      expect(flag2.riskScore).toBe(75);
    });

    it('is idempotent when createFlag is called multiple times for the same (transactionId, rule)', async () => {
      const tx = { id: 'tx-idem-1', userId: 'user-1', amount: '20000' } as any;

      const first = await flagService.createFlag(tx, 'large_transaction');
      const second = await flagService.createFlag(tx, 'large_transaction');

      expect(first.id).toBe(second.id);
      expect(flagRepo.save).toHaveBeenCalledTimes(1);
      expect(storedFlags).toHaveLength(1);
      expect(mockUserRepo.update).toHaveBeenCalledTimes(1);
    });

    it('creates two flags when a transaction matches two rules and yields at most one flag per rule when processed twice', async () => {
      const tx = {
        id: 'tx-proc-1',
        userId: 'user-1',
        amount: '15000.00',
        createdAt: new Date(),
      };
      mockTransactionRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.id === 'tx-proc-1') return tx;
        return null;
      });
      mockConfigRepo.findOne.mockResolvedValue({
        largeTxThresholdUsd: 10000,
        newAccountAgeDays: 7,
        newAccountLargeTxThresholdUsd: 5000,
        rapidMovementWindowMinutes: 60,
        rapidMovementCount: 5,
        roundTripWindowMinutes: 30,
        structuringCount: 3,
        structuringWindowHours: 24,
      });
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      mockTransactionRepo.count.mockResolvedValue(1);
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      await processor.process({ data: { transactionId: 'tx-proc-1' } } as any);
      // Processing a second time must be idempotent
      await processor.process({ data: { transactionId: 'tx-proc-1' } } as any);

      expect(storedFlags).toHaveLength(2);
      expect(storedFlags.map((f) => f.rule)).toEqual([
        'large_transaction',
        'new_account_large_tx',
      ]);
      expect(storedFlags.every((f) => f.riskScore > 0)).toBe(true);
    });
  });
});
