import { Test, TestingModule } from '@nestjs/testing';
import { AmlService } from './aml.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { AmlConfig } from './entities/aml-config.entity';
import { ComplianceFlagService } from './compliance-flag.service';
import { getQueueToken } from '@nestjs/bullmq';

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

describe('AmlService', () => {
  let service: AmlService;

  beforeEach(async () => {
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
      expect(result).toEqual('large_transaction');
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
      expect(result).toBeNull();
    });
  });
});
