import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';
import { WalletsService } from '../wallets/wallets.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

const mockSnapshotRepo = () => ({
  save: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockWalletsService = {
  listWallets: jest.fn(),
};

const mockExchangeRatesService = {
  getRate: jest.fn(),
};

describe('PortfolioService', () => {
  let service: PortfolioService;
  let snapshotRepo: ReturnType<typeof mockSnapshotRepo>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: getRepositoryToken(PortfolioSnapshot), useFactory: mockSnapshotRepo },
        { provide: WalletsService, useValue: mockWalletsService },
        { provide: ExchangeRatesService, useValue: mockExchangeRatesService },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    snapshotRepo = module.get(getRepositoryToken(PortfolioSnapshot));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('computeAndSnapshot', () => {
    it('computes USD value from wallet balances and saves a snapshot', async () => {
      mockWalletsService.listWallets.mockResolvedValue([
        {
          id: 'w1',
          balances: [
            { asset: 'XLM', balance: '1000' },
            { asset: 'USDC', balance: '500' },
          ],
        },
      ]);

      mockExchangeRatesService.getRate
        .mockResolvedValueOnce({ rate: 0.1 })   // XLM->USD: 1000 * 0.1 = 100
        .mockResolvedValueOnce({ rate: 1.0 });  // USDC->USD: 500 * 1.0 = 500

      const savedSnapshot = {
        id: 'snap-001',
        userId: 'user-1',
        totalValueUsd: 600,
        holdings: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      snapshotRepo.create.mockReturnValue(savedSnapshot);
      snapshotRepo.save.mockResolvedValue(savedSnapshot);

      const result = await service.computeAndSnapshot('user-1');

      expect(mockWalletsService.listWallets).toHaveBeenCalledWith('user-1');
      expect(mockExchangeRatesService.getRate).toHaveBeenCalledWith('XLM', 'USD');
      expect(mockExchangeRatesService.getRate).toHaveBeenCalledWith('USDC', 'USD');
      expect(result.totalValueUsd).toBe(600);
      expect(result.snapshotId).toBe('snap-001');
    });

    it('records a holding with usdValue=0 when the exchange rate is unavailable', async () => {
      mockWalletsService.listWallets.mockResolvedValue([
        { id: 'w1', balances: [{ asset: 'UNKNOWN', balance: '100' }] },
      ]);
      mockExchangeRatesService.getRate.mockRejectedValue(new Error('Rate not found'));

      const savedSnapshot = {
        id: 'snap-002',
        userId: 'user-1',
        totalValueUsd: 0,
        holdings: [{ currency: 'UNKNOWN', amount: 100, usdValue: 0, percent: 0 }],
        createdAt: new Date(),
      };
      snapshotRepo.create.mockReturnValue(savedSnapshot);
      snapshotRepo.save.mockResolvedValue(savedSnapshot);

      const result = await service.computeAndSnapshot('user-1');

      expect(result.totalValueUsd).toBe(0);
      expect(snapshotRepo.save).toHaveBeenCalled();
    });

    it('returns zero totals and empty holdings when user has no wallets', async () => {
      mockWalletsService.listWallets.mockResolvedValue([]);

      const emptySnapshot = {
        id: 'snap-003',
        userId: 'user-1',
        totalValueUsd: 0,
        holdings: [],
        createdAt: new Date(),
      };
      snapshotRepo.create.mockReturnValue(emptySnapshot);
      snapshotRepo.save.mockResolvedValue(emptySnapshot);

      const result = await service.computeAndSnapshot('user-1');

      expect(result.totalValueUsd).toBe(0);
      expect(result.holdings).toHaveLength(0);
      expect(mockExchangeRatesService.getRate).not.toHaveBeenCalled();
    });

    it('aggregates the same currency across multiple wallets before requesting a single rate', async () => {
      mockWalletsService.listWallets.mockResolvedValue([
        { id: 'w1', balances: [{ asset: 'XLM', balance: '400' }] },
        { id: 'w2', balances: [{ asset: 'XLM', balance: '600' }] },
      ]);
      mockExchangeRatesService.getRate.mockResolvedValue({ rate: 0.1 });

      const savedSnapshot = {
        id: 'snap-004',
        userId: 'user-1',
        totalValueUsd: 100,
        holdings: [{ currency: 'XLM', amount: 1000, usdValue: 100, percent: 100 }],
        createdAt: new Date(),
      };
      snapshotRepo.create.mockReturnValue(savedSnapshot);
      snapshotRepo.save.mockResolvedValue(savedSnapshot);

      await service.computeAndSnapshot('user-1');

      // Rate should only be fetched once for XLM (aggregated across 2 wallets)
      expect(mockExchangeRatesService.getRate).toHaveBeenCalledTimes(1);
      expect(mockExchangeRatesService.getRate).toHaveBeenCalledWith('XLM', 'USD');
    });
  });

  describe('getLatestSnapshot', () => {
    it('returns the most recent snapshot for a user', async () => {
      const snapshot = {
        id: 'snap-100',
        userId: 'user-1',
        totalValueUsd: 1200,
        holdings: [],
        createdAt: new Date(),
      } as PortfolioSnapshot;
      snapshotRepo.findOne.mockResolvedValue(snapshot);

      const result = await service.getLatestSnapshot('user-1');

      expect(snapshotRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(snapshot);
    });

    it('throws NotFoundException when no snapshot exists for the user', async () => {
      snapshotRepo.findOne.mockResolvedValue(null);

      await expect(service.getLatestSnapshot('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHistory', () => {
    it('returns snapshots ordered by date descending', async () => {
      const snapshots = Array.from({ length: 10 }, (_, i) => ({
        id: `snap-${i}`,
        userId: 'user-1',
        totalValueUsd: 1000 + i * 50,
        holdings: [],
        createdAt: new Date(),
      })) as PortfolioSnapshot[];

      snapshotRepo.find.mockResolvedValue(snapshots);

      const result = await service.getHistory('user-1', 10);

      expect(snapshotRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
      expect(result).toHaveLength(10);
    });

    it('enforces the 90-entry hard cap regardless of caller-supplied limit', async () => {
      snapshotRepo.find.mockResolvedValue([]);

      await service.getHistory('user-1', 200);

      expect(snapshotRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 90 }),
      );
    });

    it('defaults to 30 entries when no limit argument is passed', async () => {
      snapshotRepo.find.mockResolvedValue([]);

      await service.getHistory('user-1');

      expect(snapshotRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 30 }),
      );
    });
  });
});
