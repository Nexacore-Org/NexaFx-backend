jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const noop = () => () => {};
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    Entity: noop,
    PrimaryGeneratedColumn: noop,
    Column: noop,
    CreateDateColumn: noop,
    UpdateDateColumn: noop,
    ManyToOne: noop,
    OneToMany: noop,
    JoinColumn: noop,
    Index: noop,
  };
});

jest.mock('@nestjs/bullmq', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const getQueueToken = (name: string) => `BullQueue_${name}`;
  return {
    InjectQueue: (name: string) => Inject(getQueueToken(name)),
    getQueueToken,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { AmlService } from './aml.service';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { AmlConfig } from './entities/aml-config.entity';
import { ComplianceFlagService } from './compliance-flag.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

describe('AmlService (#1495)', () => {
  let service: AmlService;

  const mockTransactionRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
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

  const mockExchangeRatesService = {
    getRate: jest.fn(),
  };

  const defaultConfig = {
    largeTxThresholdUsd: 10000,
    newAccountAgeDays: 30,
    newAccountLargeTxThresholdUsd: 1000,
    rapidMovementWindowMinutes: 60,
    rapidMovementCount: 10,
    roundTripWindowMinutes: 60,
    structuringCount: 3,
    structuringWindowHours: 24,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockExchangeRatesService.getRate.mockImplementation(
      async (from: string, to: string) => {
        const ratesToUsd: Record<string, number> = {
          USD: 1,
          NGN: 0.000625, // 1,600 NGN = 1 USD
          BTC: 60000,
          EUR: 1.1,
        };
        if (to === 'USD' && ratesToUsd[from.toUpperCase()]) {
          return {
            from,
            to,
            rate: ratesToUsd[from.toUpperCase()],
            inverseRate: 1 / ratesToUsd[from.toUpperCase()],
            provider: 'mock',
            cachedAt: new Date().toISOString(),
            expiresAt: new Date().toISOString(),
          };
        }
        throw new Error(`No mock rate for ${from}->${to}`);
      },
    );

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
        {
          provide: ExchangeRatesService,
          useValue: mockExchangeRatesService,
        },
      ],
    }).compile();

    service = module.get<AmlService>(AmlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluate — currency conversion for amount-based rules', () => {
    it('flags a large USD transaction exceeding largeTxThresholdUsd', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);
      mockUserRepo.findOne.mockResolvedValue({ createdAt: new Date() });
      mockTransactionRepo.count.mockResolvedValue(0);
      mockTransactionRepo.findOne.mockResolvedValue(null);
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      const transaction = {
        id: 'tx-usd-large',
        amount: '15000.00',
        currency: 'USD',
        userId: 'user-id',
      };

      const result = await service.evaluate(transaction as any);
      expect(result).toBe('large_transaction');
    });

    it('does NOT trigger large_transaction or new_account_large_tx for a 10,000 NGN (~$6.25) transaction', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2-day-old account
      });
      mockTransactionRepo.count.mockResolvedValue(1);
      mockTransactionRepo.findOne.mockResolvedValue(null);
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
      });

      const transaction = {
        id: 'tx-ngn-small',
        amount: '10000.00000000',
        currency: 'NGN',
        type: TransactionType.DEPOSIT,
        userId: 'user-id',
        createdAt: new Date(),
      };

      const result = await service.evaluate(transaction as any);
      expect(result).toBeNull();
    });

    it('triggers large_transaction for a high-value asset (0.25 BTC = $15,000 USD)', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);

      const transaction = {
        id: 'tx-btc-large',
        amount: '0.25000000',
        currency: 'BTC',
        type: TransactionType.DEPOSIT,
        userId: 'user-id',
        createdAt: new Date(),
      };

      const result = await service.evaluate(transaction as any);
      expect(result).toBe('large_transaction');
    });

    it('triggers new_account_large_tx when USD equivalent exceeds newAccountLargeTxThresholdUsd (1,000 EUR = $1,100 USD)', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days old (< 30)
      });

      const transaction = {
        id: 'tx-eur-new-acct',
        amount: '1000.00000000',
        currency: 'EUR',
        type: TransactionType.DEPOSIT,
        userId: 'user-id',
        createdAt: new Date(),
      };

      const result = await service.evaluate(transaction as any);
      expect(result).toBe('new_account_large_tx');
    });

    it('triggers round_trip when a withdrawal of 100 matches a deposit stored as "100.00000000"', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });
      mockTransactionRepo.count.mockResolvedValue(2);

      const now = new Date();
      const storedDeposit = {
        id: 'tx-deposit',
        userId: 'user-id',
        type: TransactionType.DEPOSIT,
        amount: '100.00000000',
        currency: 'USD',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date(now.getTime() - 10 * 60 * 1000),
      };

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(storedDeposit),
        getMany: jest.fn().mockResolvedValue([storedDeposit]),
        getCount: jest.fn().mockResolvedValue(1),
      };
      mockTransactionRepo.createQueryBuilder.mockReturnValue(qb);
      mockTransactionRepo.findOne.mockResolvedValue(storedDeposit);

      const withdrawal = {
        id: 'tx-withdraw',
        userId: 'user-id',
        type: TransactionType.WITHDRAW,
        amount: '100',
        currency: 'USD',
        status: TransactionStatus.SUCCESS,
        createdAt: now,
      };

      const result = await service.evaluate(withdrawal as any);
      expect(result).toBe('round_trip');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ABS(CAST(tx.amount AS DECIMAL)'),
        expect.objectContaining({
          targetAmount: '100.00000000',
        }),
      );
    });

    it('evaluates structuring using USD-normalised amounts across currencies', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });
      mockTransactionRepo.count.mockResolvedValue(3);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      // Three transactions near the $10,000 threshold ($9,000..$9,999 USD equivalent),
      // plus a 9,500 NGN (~$5.94) transaction that must NOT be counted as structuring.
      const candidates = [
        { amount: '9500.00000000', currency: 'USD' }, // $9,500
        { amount: '8500.00000000', currency: 'EUR' }, // 8,500 * 1.1 = $9,350
        { amount: '15200000.00000000', currency: 'NGN' }, // 15,200,000 * 0.000625 = $9,500
        { amount: '9500.00000000', currency: 'NGN' }, // $5.94 (not near threshold)
      ];

      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(candidates),
        getCount: jest.fn().mockResolvedValue(3),
      });

      const currentTx = {
        id: 'tx-struct-eur',
        userId: 'user-id',
        type: TransactionType.DEPOSIT,
        amount: '8500.00000000', // $9,350 USD
        currency: 'EUR',
        createdAt: new Date(),
      };

      const result = await service.evaluate(currentTx as any);
      expect(result).toBe('structuring');
    });

    it('does not trigger structuring when 9,500 NGN transactions are evaluated against a $10,000 USD threshold', async () => {
      mockConfigRepo.findOne.mockResolvedValue(defaultConfig);
      mockUserRepo.findOne.mockResolvedValue({
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });
      mockTransactionRepo.count.mockResolvedValue(4);
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const ngnCandidates = [
        { amount: '9500.00000000', currency: 'NGN' },
        { amount: '9600.00000000', currency: 'NGN' },
        { amount: '9700.00000000', currency: 'NGN' },
      ];
      mockTransactionRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(ngnCandidates),
        getCount: jest.fn().mockResolvedValue(0),
      });

      const tx = {
        id: 'tx-ngn-9500',
        userId: 'user-id',
        type: TransactionType.DEPOSIT,
        amount: '9500.00000000',
        currency: 'NGN',
        createdAt: new Date(),
      };

      const result = await service.evaluate(tx as any);
      expect(result).toBeNull();
    });
  });
});
