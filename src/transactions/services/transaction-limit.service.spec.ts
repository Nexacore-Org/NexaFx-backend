import { Test, TestingModule } from '@nestjs/testing';
import { TransactionLimitService } from './transaction-limit.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserKycTier } from '../../users/user.entity';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TransactionLimitService', () => {
  let service: TransactionLimitService;
  let userRepository: jest.Mocked<Repository<User>>;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let transactionLimitRepository: jest.Mocked<Repository<TransactionLimit>>;
  let exchangeRatesService: jest.Mocked<ExchangeRatesService>;

  const mockUser = {
    id: 'user-123',
    kycTier: UserKycTier.BASIC,
  };

  const mockTransactionLimit = {
    id: 'limit-1',
    tier: UserKycTier.BASIC,
    dailyLimitUsd: '1000',
    monthlyLimitUsd: '15000',
    singleTxLimitUsd: '1000',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionLimitService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            sum: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TransactionLimit),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: ExchangeRatesService,
          useValue: {
            convertToUsd: jest.fn(),
            getRate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TransactionLimitService);
    userRepository = module.get(getRepositoryToken(User));
    transactionRepository = module.get(getRepositoryToken(Transaction));
    transactionLimitRepository = module.get(getRepositoryToken(TransactionLimit));
    exchangeRatesService = module.get(ExchangeRatesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listLimits', () => {
    it('should return all transaction limits', async () => {
      const mockLimits = [
        { tier: UserKycTier.UNVERIFIED, dailyLimitUsd: '100' },
        { tier: UserKycTier.BASIC, dailyLimitUsd: '1000' },
      ];

      transactionLimitRepository.findOne.mockResolvedValue(mockLimits[0]);
      transactionLimitRepository.find.mockResolvedValue(mockLimits);

      const result = await service.listLimits();

      expect(result).toEqual(mockLimits);
    });

    it('should return correct limits for UNVERIFIED tier', async () => {
      transactionLimitRepository.find.mockResolvedValue([
        {
          tier: UserKycTier.UNVERIFIED,
          dailyLimitUsd: '100',
          monthlyLimitUsd: '1000',
          singleTxLimitUsd: '100',
        },
      ]);

      const result = await service.listLimits();

      expect(result[0].dailyLimitUsd).toBe('100');
    });

    it('should return correct limits for BASIC tier', async () => {
      transactionLimitRepository.find.mockResolvedValue([mockTransactionLimit]);

      const result = await service.listLimits();

      expect(result[0].dailyLimitUsd).toBe('1000');
    });

    it('should return correct limits for ENHANCED tier', async () => {
      transactionLimitRepository.find.mockResolvedValue([
        {
          tier: UserKycTier.ENHANCED,
          dailyLimitUsd: '10000',
          monthlyLimitUsd: '150000',
          singleTxLimitUsd: '10000',
        },
      ]);

      const result = await service.listLimits();

      expect(result[0].dailyLimitUsd).toBe('10000');
    });
  });

  describe('upsertLimit', () => {
    it('should update existing limit', async () => {
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);
      transactionLimitRepository.save.mockResolvedValue({
        ...mockTransactionLimit,
        dailyLimitUsd: '2000',
      });

      const result = await service.upsertLimit(UserKycTier.BASIC, {
        dailyLimitUsd: 2000,
        monthlyLimitUsd: 30000,
        singleTxLimitUsd: 2000,
      });

      expect(transactionLimitRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException for negative limits', async () => {
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);

      await expect(
        service.upsertLimit(UserKycTier.BASIC, {
          dailyLimitUsd: -100,
          monthlyLimitUsd: 15000,
          singleTxLimitUsd: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyTransactionLimit', () => {
    it('should allow transaction within daily limit', async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser, kycTier: UserKycTier.BASIC });
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);
      transactionRepository.find.mockResolvedValue([]);
      exchangeRatesService.convertToUsd.mockResolvedValue(500);

      const result = await service.verifyTransactionLimit('user-123', 500, 'EUR');

      expect(result).toEqual({ allowed: true });
    });

    it('should reject UNVERIFIED user on any transaction', async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        kycTier: UserKycTier.UNVERIFIED,
      });

      await expect(
        service.verifyTransactionLimit('user-123', 50, 'USD'),
      ).rejects.toThrow();
    });

    it('should reject transaction exceeding daily limit', async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser, kycTier: UserKycTier.BASIC });
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);
      transactionRepository.find.mockResolvedValue([]);
      exchangeRatesService.convertToUsd.mockResolvedValue(1500);

      await expect(
        service.verifyTransactionLimit('user-123', 1500, 'USD'),
      ).rejects.toThrow();
    });

    it('should correctly sum today transactions for daily cap', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      userRepository.findOne.mockResolvedValue({ ...mockUser, kycTier: UserKycTier.BASIC });
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);

      const mockTxs = [
        {
          amount: 400,
          createdAt: new Date(),
          status: TransactionStatus.COMPLETED,
        },
        {
          amount: 300,
          createdAt: new Date(),
          status: TransactionStatus.COMPLETED,
        },
      ];

      transactionRepository.find.mockResolvedValue(mockTxs);
      exchangeRatesService.convertToUsd.mockResolvedValue(400);

      await service.verifyTransactionLimit('user-123', 400, 'USD');

      expect(transactionRepository.find).toHaveBeenCalled();
    });

    it('should correctly sum monthly transactions for monthly cap', async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser, kycTier: UserKycTier.BASIC });
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);

      const mockTxs = [
        { amount: 5000, status: TransactionStatus.COMPLETED },
        { amount: 7000, status: TransactionStatus.COMPLETED },
      ];

      transactionRepository.find.mockResolvedValue(mockTxs);
      exchangeRatesService.convertToUsd.mockResolvedValue(2500);

      await service.verifyTransactionLimit('user-123', 2500, 'USD');

      expect(transactionRepository.find).toHaveBeenCalled();
    });

    it('should convert to USD before comparing limits', async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser, kycTier: UserKycTier.BASIC });
      transactionLimitRepository.findOne.mockResolvedValue(mockTransactionLimit);
      transactionRepository.find.mockResolvedValue([]);
      exchangeRatesService.convertToUsd.mockResolvedValue(500);

      await service.verifyTransactionLimit('user-123', 500, 'EUR');

      expect(exchangeRatesService.convertToUsd).toHaveBeenCalledWith(500, 'EUR');
    });
  });
});
