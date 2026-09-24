import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LimitsService } from './limits.service';
import { TransactionLimit } from './entities/transaction-limit.entity';
import { FeeConfig } from './entities/fee-config.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { User, UserKycTier } from '../../users/user.entity';
import { Transaction, TransactionStatus } from '../../transactions/entities/transaction.entity';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

describe('LimitsService', () => {
  let service: LimitsService;
  let limitRepo: Repository<TransactionLimit>;
  let feeRepo: Repository<FeeConfig>;
  let userRepo: Repository<User>;
  let transactionRepo: Repository<Transaction>;
  let exchangeService: ExchangeRatesService;

  const mockUser = (id: string, tier: UserKycTier, emailVerified = true, kycApproved = true) =>
    ({ id, kycTier: tier, isEmailVerified: emailVerified, isVerified: emailVerified, kycApproved } as any);

  const mockLimit = (kycTier: UserKycTier, single: string, daily: string, monthly: string) =>
    ({ kycTier, singleTransactionMax: single, dailyMax: daily, monthlyMax: monthly, currency: 'USD', isActive: true } as TransactionLimit);

  const mockFee = (type: string, feeType: string, feeValue: string, minFee: string | null = null, maxFee: string | null = null) =>
    ({ transactionType: type, feeType, feeValue, minFee, maxFee, currency: 'USD', isActive: true } as FeeConfig);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LimitsService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(TransactionLimit),
          useValue: { findOne: jest.fn(), find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(FeeConfig),
          useValue: { findOne: jest.fn(), find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: ExchangeRatesService,
          useValue: { getRate: jest.fn().mockResolvedValue({ rate: 1 }) },
        },
      ],
    }).compile();

    service = module.get<LimitsService>(LimitsService);
    limitRepo = module.get<Repository<TransactionLimit>>(getRepositoryToken(TransactionLimit));
    feeRepo = module.get<Repository<FeeConfig>>(getRepositoryToken(FeeConfig));
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    transactionRepo = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    exchangeService = module.get<ExchangeRatesService>(ExchangeRatesService);
  });

  describe('getUserKycTier', () => {
    it('returns UNVERIFIED when email not verified and no KYC', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser('1', UserKycTier.UNVERIFIED, false, false));
      const tier = await service.getUserKycTier('1');
      expect(tier).toBe(UserKycTier.UNVERIFIED);
    });

    it('returns BASIC when email verified but KYC not approved', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser('2', UserKycTier.BASIC, true, false));
      const tier = await service.getUserKycTier('2');
      expect(tier).toBe(UserKycTier.BASIC);
    });

    it('returns FULL when KYC approved', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser('3', UserKycTier.FULL, true, true));
      const tier = await service.getUserKycTier('3');
      expect(tier).toBe(UserKycTier.FULL);
    });
  });

  describe('checkLimit', () => {
    const userId = 'u1';

    beforeEach(() => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser(userId, UserKycTier.BASIC, true, false));
      jest.spyOn(limitRepo, 'findOne').mockImplementation(async (opts: any) => {
        const tier = opts.where?.kycTier || opts.where?.[0]?.kycTier;
        if (tier === UserKycTier.UNVERIFIED) return mockLimit(UserKycTier.UNVERIFIED, '0', '0', '0');
        if (tier === UserKycTier.BASIC) return mockLimit(UserKycTier.BASIC, '500', '5000', '50000');
        if (tier === UserKycTier.FULL) return mockLimit(UserKycTier.FULL, '10000', '50000', '500000');
        return null;
      });

      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(transactionRepo, 'createQueryBuilder').mockReturnValue(qb);
    });

    it('rejects UNVERIFIED users for non-zero transactions', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser(userId, UserKycTier.UNVERIFIED, false, false));
      await expect(service.checkLimit(userId, 'SEND', 10, 'USD')).rejects.toThrow(UnprocessableEntityException);
    });

    it('allows BASIC users within limits', async () => {
      const result = await service.checkLimit(userId, 'SEND', 100, 'USD');
      expect(result.allowed).toBe(true);
      expect(result.remaining.daily).toBe(5000);
      expect(result.remaining.monthly).toBe(50000);
    });

    it('rejects BASIC users exceeding single limit', async () => {
      await expect(service.checkLimit(userId, 'SEND', 600, 'USD')).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects BASIC users exceeding daily limit', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(async () => [
          { amount: '4900', currency: 'USD', status: TransactionStatus.SUCCESS },
        ]),
      };
      jest.spyOn(transactionRepo, 'createQueryBuilder').mockReturnValue(qb);

      await expect(service.checkLimit(userId, 'SEND', 200, 'USD')).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects BASIC users exceeding monthly limit', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(async () => [
          { amount: '49500', currency: 'USD', status: TransactionStatus.SUCCESS },
        ]),
      };
      jest.spyOn(transactionRepo, 'createQueryBuilder').mockReturnValue(qb);

      await expect(service.checkLimit(userId, 'SEND', 1000, 'USD')).rejects.toThrow(UnprocessableEntityException);
    });

    it('allows FULL users within their high limits', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser(userId, UserKycTier.FULL, true, true));
      const result = await service.checkLimit(userId, 'SEND', 8000, 'USD');
      expect(result.allowed).toBe(true);
    });

    it('handles USD conversion via ExchangeRatesService', async () => {
      jest.spyOn(exchangeService, 'getRate').mockResolvedValue({ rate: 2 } as any);
      await expect(service.checkLimit(userId, 'SEND', 300, 'EUR')).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('calculateFee', () => {
    it('calculates flat fee', async () => {
      jest.spyOn(feeRepo, 'findOne').mockResolvedValue(mockFee('WITHDRAWAL', 'FLAT', '1.00'));
      const fee = await service.calculateFee('WITHDRAWAL', 100, 'USD');
      expect(fee.feeAmount).toBe(1);
    });

    it('calculates percentage fee with min fee enforcement', async () => {
      jest.spyOn(feeRepo, 'findOne').mockResolvedValue(mockFee('SEND', 'PERCENT', '0.5', '0.10'));
      const fee = await service.calculateFee('SEND', 10, 'USD'); // 0.5% of 10 is 0.05, min is 0.10
      expect(fee.feeAmount).toBe(0.1);
    });

    it('calculates percentage fee with max fee enforcement', async () => {
      jest.spyOn(feeRepo, 'findOne').mockResolvedValue(mockFee('SEND', 'PERCENT', '0.5', '0.10', '2.00'));
      const fee = await service.calculateFee('SEND', 1000, 'USD'); // 0.5% of 1000 is 5, max is 2
      expect(fee.feeAmount).toBe(2);
    });
  });

  describe('getUserLimitStatus / GET /limits/me', () => {
    it('returns correct remaining daily and monthly allowance', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser('u1', UserKycTier.BASIC, true, false));
      jest.spyOn(limitRepo, 'findOne').mockResolvedValue(mockLimit(UserKycTier.BASIC, '500', '5000', '50000'));
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(transactionRepo, 'createQueryBuilder').mockReturnValue(qb);

      const status = await service.getUserLimitStatus('u1');
      expect(status.kycTier).toBe(UserKycTier.BASIC);
      expect(status.remaining.daily).toBe(5000);
      expect(status.remaining.monthly).toBe(50000);
    });
  });
});
