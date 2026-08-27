import { Test, TestingModule } from '@nestjs/testing';
import { RebalancingService } from './rebalancing.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RebalancingPolicy } from './entities/rebalancing-policy.entity';
import { WalletService } from '../wallet/wallet.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { ConversionsService } from '../conversions/conversions.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('RebalancingService', () => {
  let service: RebalancingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RebalancingService,
        {
          provide: getRepositoryToken(RebalancingPolicy),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: WalletService,
          useValue: {
            getBalances: jest.fn(),
          },
        },
        {
          provide: ExchangeRateService,
          useValue: {
            getRatesToUsd: jest.fn(),
          },
        },
        {
          provide: ConversionsService,
          useValue: {
            quote: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RebalancingService>(RebalancingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertPolicy', () => {
    it('should throw an error if allocations do not sum to 100', async () => {
      const dto = {
        allocations: [{ currency: 'BTC', targetPercent: 50 }],
      } as any;
      await expect(service.upsertPolicy('user1', dto)).rejects.toThrow(
        new BadRequestException(
          'Target allocations percentage must sum to 100%',
        ),
      );
    });

    it('should create a new policy if one does not exist', async () => {
      const dto = {
        allocations: [{ currency: 'BTC', targetPercent: 100 }],
        isActive: true,
        driftThresholdPercent: 5,
        frequency: RebalanceFrequency.MONTHLY,
      };
      const policyRepo = (service as any).policyRepo;
      policyRepo.findOne.mockResolvedValue(null);
      policyRepo.create.mockReturnValue({});
      await service.upsertPolicy('user1', dto);
      expect(policyRepo.create).toHaveBeenCalledWith({
        userId: 'user1',
        ...dto,
      });
      expect(policyRepo.save).toHaveBeenCalled();
    });
  });

  describe('checkDrift', () => {
    it("should identify when a user's allocation has drifted past the threshold", async () => {
      const policy = {
        userId: 'user1',
        allocations: [
          { currency: 'BTC', targetPercent: 50 },
          { currency: 'ETH', targetPercent: 50 },
        ],
        driftThresholdPercent: 5,
      };
      const balances = [
        { currency: 'BTC', amount: '1' },
        { currency: 'ETH', amount: '10' },
      ];
      const rates = { BTC: 50000, ETH: 4000 };

      (service as any).policyRepo.findOne.mockResolvedValue(policy);
      (service as any).walletService.getBalances.mockResolvedValue(balances);
      (service as any).exchangeRateService.getRatesToUsd.mockResolvedValue(
        rates,
      );

      const result = await service.checkDrift('user1');
      expect(result.needsRebalancing).toBe(true);
      expect(result.drifts.length).toBe(2);
    });
  });

  describe('calculateTrades', () => {
    it('should propose trades to move the portfolio toward the target allocation', async () => {
      const policy = {
        userId: 'user1',
        allocations: [
          { currency: 'BTC', targetPercent: 50 },
          { currency: 'ETH', targetPercent: 50 },
        ],
        driftThresholdPercent: 5,
      };
      const balances = [
        { currency: 'BTC', amount: '1.2' },
        { currency: 'ETH', amount: '10' },
      ];
      const rates = { BTC: 50000, ETH: 4000 };

      (service as any).policyRepo.findOne.mockResolvedValue(policy);
      (service as any).walletService.getBalances.mockResolvedValue(balances);
      (service as any).exchangeRateService.getRatesToUsd.mockResolvedValue(
        rates,
      );

      const trades = await service.calculateTrades('user1');
      expect(trades.length).toBe(1);
      expect(trades[0].fromCurrency).toBe('BTC');
      expect(trades[0].toCurrency).toBe('ETH');
      expect(trades[0].fromAmount).toBeCloseTo(0.1);
    });
  });
});
