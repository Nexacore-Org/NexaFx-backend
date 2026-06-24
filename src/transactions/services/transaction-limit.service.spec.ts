import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionLimitService } from './transaction-limit.service';
import { User, UserKycTier } from '../../users/user.entity';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { UnprocessableEntityException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('TransactionLimitService', () => {
  let service: TransactionLimitService;
  let userRepository: Repository<User>;
  let transactionRepository: Repository<Transaction>;
  let limitRepository: Repository<TransactionLimit>;
  let exchangeRatesService: ExchangeRatesService;

  const mockUser = {
    id: 'user-123',
    kycTier: UserKycTier.BASIC,
    email: 'test@example.com',
  };

  const mockLimit = {
    id: 'limit-123',
    tier: UserKycTier.BASIC,
    transactionType: 'SEND',
    currency: 'USD',
    singleTransactionMax: '500',
    dailyMax: '5000',
    monthlyMax: '50000',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockExchangeRate = {
    from: 'EUR',
    to: 'USD',
    rate: 1.1,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionLimitService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
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
            getRate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionLimitService>(TransactionLimitService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    limitRepository = module.get<Repository<TransactionLimit>>(
      getRepositoryToken(TransactionLimit),
    );
    exchangeRatesService = module.get<ExchangeRatesService>(ExchangeRatesService);
  });

  describe('checkLimit', () => {
    it('should reject UNVERIFIED users', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        ...mockUser,
        kycTier: UserKycTier.UNVERIFIED,
      });

      await expect(
        service.checkLimit('user-123', 'SEND', 100, 'USD'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should reject transaction exceeding single transaction limit', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(mockLimit);

      await expect(
        service.checkLimit('user-123', 'SEND', 600, 'USD'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should allow transaction within limits', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(mockLimit);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(transactionRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.checkLimit('user-123', 'SEND', 100, 'USD');

      expect(result.allowed).toBe(true);
      expect(result.remaining.daily).toBeGreaterThan(0);
      expect(result.remaining.monthly).toBeGreaterThan(0);
    });

    it('should reject transaction if no active limit config found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.checkLimit('user-123', 'SEND', 100, 'USD'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should handle currency conversion', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(mockLimit);
      jest.spyOn(exchangeRatesService, 'getRate').mockResolvedValue(mockExchangeRate);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(transactionRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.checkLimit('user-123', 'SEND', 100, 'EUR');

      expect(result.allowed).toBe(true);
      expect(exchangeRatesService.getRate).toHaveBeenCalledWith('EUR', 'USD');
    });
  });

  describe('getUserKycTier', () => {
    it('should return user KYC tier', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      const tier = await service.getUserKycTier('user-123');

      expect(tier).toBe(UserKycTier.BASIC);
    });

    it('should throw if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getUserKycTier('user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertLimit', () => {
    it('should create new limit', async () => {
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(limitRepository, 'create').mockReturnValue(mockLimit as any);
      jest.spyOn(limitRepository, 'save').mockResolvedValue(mockLimit);

      const result = await service.upsertLimit(
        UserKycTier.BASIC,
        'SEND',
        'USD',
        {
          singleTransactionMax: 500,
          dailyMax: 5000,
          monthlyMax: 50000,
        },
      );

      expect(result).toEqual(mockLimit);
      expect(limitRepository.save).toHaveBeenCalled();
    });

    it('should update existing limit', async () => {
      const existingLimit = { ...mockLimit };
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(existingLimit as any);
      jest.spyOn(limitRepository, 'save').mockResolvedValue(existingLimit);

      const result = await service.upsertLimit(
        UserKycTier.BASIC,
        'SEND',
        'USD',
        {
          singleTransactionMax: 1000,
          dailyMax: 10000,
          monthlyMax: 100000,
        },
      );

      expect(limitRepository.save).toHaveBeenCalled();
    });

    it('should reject negative limit values', async () => {
      await expect(
        service.upsertLimit(UserKycTier.BASIC, 'SEND', 'USD', {
          singleTransactionMax: -100,
          dailyMax: 5000,
          monthlyMax: 50000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if daily limit is less than single limit', async () => {
      await expect(
        service.upsertLimit(UserKycTier.BASIC, 'SEND', 'USD', {
          singleTransactionMax: 5000,
          dailyMax: 1000,
          monthlyMax: 50000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if monthly limit is less than daily limit', async () => {
      await expect(
        service.upsertLimit(UserKycTier.BASIC, 'SEND', 'USD', {
          singleTransactionMax: 500,
          dailyMax: 5000,
          monthlyMax: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateLimit', () => {
    it('should update limit by ID', async () => {
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(mockLimit as any);
      jest.spyOn(limitRepository, 'save').mockResolvedValue(mockLimit);

      const result = await service.updateLimit('limit-123', {
        dailyMax: 6000,
        isActive: true,
      });

      expect(limitRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockLimit);
    });

    it('should throw if limit not found', async () => {
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateLimit('non-existent', { dailyMax: 5000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listLimits', () => {
    it('should return active limits sorted by tier and type', async () => {
      jest.spyOn(limitRepository, 'find').mockResolvedValue([mockLimit] as any);

      const result = await service.listLimits();

      expect(result).toEqual([mockLimit]);
      expect(limitRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { tier: 'ASC', transactionType: 'ASC', currency: 'ASC' },
      });
    });
  });

  describe('getUserLimitStatus', () => {
    it('should return complete limit status for user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(limitRepository, 'findOne').mockResolvedValue(mockLimit as any);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(transactionRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.getUserLimitStatus('user-123');

      expect(result.tier).toBe(UserKycTier.BASIC);
      expect(result.limits.dailyLimitUsd).toBe(5000);
      expect(result.limits.monthlyLimitUsd).toBe(50000);
      expect(result.limits.singleTxLimitUsd).toBe(500);
      expect(result.remaining.dailyUsd).toBeGreaterThan(0);
      expect(result.remaining.monthlyUsd).toBeGreaterThan(0);
    });

    it('should throw if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getUserLimitStatus('user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
