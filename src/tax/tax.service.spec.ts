import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TaxService } from './tax.service';
import { CostBasisLot } from './entities/cost-basis-lot.entity';
import { TaxEvent, TaxEventType } from './entities/tax-event.entity';
import { PriceSnapshot } from './entities/price-snapshot.entity';
import { TaxExportJob, TaxExportJurisdiction, TaxExportStatus } from './entities/tax-export-job.entity';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/entities/transaction.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { TAX_QUEUE } from '../modules/queues/queue.constants';
import { getQueueToken } from '@nestjs/bullmq';
import Decimal from 'decimal.js';

describe('TaxService', () => {
  let service: TaxService;

  let costBasisLots: CostBasisLot[];
  let taxEvents: TaxEvent[];
  let priceSnapshots: PriceSnapshot[];
  let taxExportJobs: TaxExportJob[];
  let transactions: Transaction[];

  const mockCostBasisLotRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn(async (lot) => {
      const saved = { id: lot.id || `lot-${Math.random()}`, ...lot } as CostBasisLot;
      const idx = costBasisLots.findIndex((l) => l.id === saved.id);
      if (idx >= 0) costBasisLots[idx] = saved;
      else costBasisLots.push(saved);
      return saved;
    }),
    find: jest.fn(async ({ where, order }) => {
      let filtered = costBasisLots.filter(
        (l) => l.userId === where.userId && l.currency === where.currency,
      );
      if (order?.acquiredAt === 'ASC') {
        filtered.sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
      }
      return filtered;
    }),
    findOne: jest.fn(async ({ where }) => {
      if (where.sourceTransactionId) {
        return costBasisLots.find((l) => l.sourceTransactionId === where.sourceTransactionId) || null;
      }
      return null;
    }),
  };

  const mockTaxEventRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn(async (evt) => {
      const saved = { id: evt.id || `evt-${Math.random()}`, createdAt: evt.createdAt || new Date(), ...evt } as TaxEvent;
      taxEvents.push(saved);
      return saved;
    }),
    find: jest.fn(async ({ where, order, relations }) => {
      let filtered = taxEvents.filter((e) => {
        if (where.userId !== e.userId) return false;
        if (where.taxYear !== undefined && e.taxYear !== where.taxYear) return false;
        if (where.eventType !== undefined && e.eventType !== where.eventType) return false;
        return true;
      });
      if (order?.createdAt === 'ASC') {
        filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      if (relations && relations.includes('transaction')) {
        filtered = filtered.map((e) => {
          const tx = transactions.find((t) => t.id === e.transactionId);
          if (tx) {
            e.transaction = tx;
          }
          return e;
        });
      }
      return filtered;
    }),
    findAndCount: jest.fn(async ({ where, skip, take }) => {
      let filtered = taxEvents.filter((e) => e.userId === where.userId);
      if (where.currency) {
        filtered = filtered.filter((e) => e.currency === where.currency);
      }
      const total = filtered.length;
      const sliced = filtered.slice(skip, skip + take);
      return [sliced, total];
    }),
    findOne: jest.fn(async ({ where }) => {
      if (where.transactionId) {
        return taxEvents.find((e) => e.transactionId === where.transactionId) || null;
      }
      return null;
    }),
  };

  const mockPriceSnapshotRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn(async (snap) => {
      const saved = { id: snap.id || `snap-${Math.random()}`, ...snap } as PriceSnapshot;
      priceSnapshots.push(saved);
      return saved;
    }),
    findOne: jest.fn(async ({ where }) => {
      return priceSnapshots.find(
        (s) => s.transactionId === where.transactionId && s.currency === where.currency,
      ) || null;
    }),
  };

  const mockTaxExportJobRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn(async (job) => {
      const saved = { id: job.id || `job-${Math.random()}`, status: job.status || TaxExportStatus.PENDING, ...job } as TaxExportJob;
      taxExportJobs.push(saved);
      return saved;
    }),
    findOne: jest.fn(async ({ where }) => {
      return taxExportJobs.find((j) => j.id === where.id && j.userId === where.userId) || null;
    }),
    update: jest.fn(async (id, updateDto) => {
      const job = taxExportJobs.find((j) => j.id === id);
      if (job) {
        Object.assign(job, updateDto);
      }
    }),
  };

  const mockTransactionRepository = {
    findOne: jest.fn(async ({ where }) => {
      return transactions.find((t) => t.id === where.id) || null;
    }),
  };

  const mockExchangeRatesService = {
    getRate: jest.fn(async (from: string, to: string) => {
      if (from.toUpperCase() === 'GBP') return { rate: 1.25 };
      return { rate: 1.0 };
    }),
  };

  const mockTaxQueue = {
    add: jest.fn(async () => ({})),
  };

  beforeEach(async () => {
    costBasisLots = [];
    taxEvents = [];
    priceSnapshots = [];
    taxExportJobs = [];
    transactions = [];

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxService,
        { provide: getRepositoryToken(CostBasisLot), useValue: mockCostBasisLotRepository },
        { provide: getRepositoryToken(TaxEvent), useValue: mockTaxEventRepository },
        { provide: getRepositoryToken(PriceSnapshot), useValue: mockPriceSnapshotRepository },
        { provide: getRepositoryToken(TaxExportJob), useValue: mockTaxExportJobRepository },
        { provide: getRepositoryToken(Transaction), useValue: mockTransactionRepository },
        { provide: ExchangeRatesService, useValue: mockExchangeRatesService },
        { provide: getQueueToken(TAX_QUEUE), useValue: mockTaxQueue },
      ],
    }).compile();

    service = module.get<TaxService>(TaxService);
  });

  describe('FIFO Cost-Basis Lot Tracking & Gains Calculations', () => {
    it('should create a cost basis lot and an ACQUISITION tax event on deposit', async () => {
      const tx = {
        id: 'tx-1',
        userId: 'user-123',
        type: TransactionType.DEPOSIT,
        amount: '100.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(tx);

      mockExchangeRatesService.getRate.mockResolvedValue({ rate: 1.5 }); // XLM is $1.50

      await service.processTransaction('tx-1');

      expect(costBasisLots).toHaveLength(1);
      expect(costBasisLots[0]).toMatchObject({
        userId: 'user-123',
        currency: 'XLM',
        quantity: '100.00000000',
        costBasisUsd: '150.00000000',
        remainingQuantity: '100.00000000',
        sourceTransactionId: 'tx-1',
      });

      expect(taxEvents).toHaveLength(1);
      expect(taxEvents[0]).toMatchObject({
        userId: 'user-123',
        transactionId: 'tx-1',
        eventType: TaxEventType.ACQUISITION,
        currency: 'XLM',
        quantity: '100.00000000',
        priceUsdAtEvent: '1.50000000',
        costBasisUsd: '150.00000000',
        proceedsUsd: null,
        gainLossUsd: null,
      });

      expect(priceSnapshots).toHaveLength(2); // XLM and GBP fallbacks
    });

    it('should match disposal against acquisition lot using FIFO', async () => {
      // 1. Acquisition: Buy 100 XLM at $1.50
      const txAcq = {
        id: 'tx-acq',
        userId: 'user-123',
        type: TransactionType.DEPOSIT,
        amount: '100.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(txAcq);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 1.5 });
      await service.processTransaction('tx-acq');

      // 2. Disposal: Sell 40 XLM at $2.50
      const txDisp = {
        id: 'tx-disp',
        userId: 'user-123',
        type: TransactionType.WITHDRAW,
        amount: '40.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-10T12:00:00Z'),
      } as Transaction;
      transactions.push(txDisp);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 2.5 }); // Rate snapshot at disposal
      await service.processTransaction('tx-disp');

      // Remaining lot size check
      expect(costBasisLots[0].remainingQuantity).toBe('60.00000000');

      // Gain/Loss check
      // Proceeds: 40 * $2.50 = $100.00
      // Cost basis: 40 * $1.50 = $60.00
      // Net gain: $40.00
      const disposalEvent = taxEvents.find((e) => e.eventType === TaxEventType.DISPOSAL);
      expect(disposalEvent).toBeDefined();
      expect(disposalEvent).toMatchObject({
        quantity: '40.00000000',
        priceUsdAtEvent: '2.50000000',
        costBasisUsd: '60.00000000',
        proceedsUsd: '100.00000000',
        gainLossUsd: '40.00000000',
        holdingPeriodDays: 9,
      });
    });

    it('should consume multiple lots sequentially for a single disposal', async () => {
      // Lot 1: 10 XLM at $5.00
      const tx1 = {
        id: 'tx-1',
        userId: 'user-1',
        type: TransactionType.DEPOSIT,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(tx1);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 5.0 });
      await service.processTransaction('tx-1');

      // Lot 2: 10 XLM at $10.00
      const tx2 = {
        id: 'tx-2',
        userId: 'user-1',
        type: TransactionType.DEPOSIT,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-02T12:00:00Z'),
      } as Transaction;
      transactions.push(tx2);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 10.0 });
      await service.processTransaction('tx-2');

      // Disposal: 15 XLM at $20.00
      const tx3 = {
        id: 'tx-3',
        userId: 'user-1',
        type: TransactionType.WITHDRAW,
        amount: '15.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-05T12:00:00Z'),
      } as Transaction;
      transactions.push(tx3);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 20.0 });
      await service.processTransaction('tx-3');

      // Expect Lot 1 remaining = 0
      expect(costBasisLots[0].remainingQuantity).toBe('0.00000000');
      // Expect Lot 2 remaining = 5
      expect(costBasisLots[1].remainingQuantity).toBe('5.00000000');

      // Expect two disposal events
      const disposals = taxEvents.filter((e) => e.eventType === TaxEventType.DISPOSAL);
      expect(disposals).toHaveLength(2);

      // Event 1 (consuming lot 1):
      // qty: 10, proceeds: 10 * 20 = 200, cost basis: 10 * 5 = 50, gain: 150
      expect(disposals[0]).toMatchObject({
        quantity: '10.00000000',
        costBasisUsd: '50.00000000',
        proceedsUsd: '200.00000000',
        gainLossUsd: '150.00000000',
      });

      // Event 2 (consuming lot 2):
      // qty: 5, proceeds: 5 * 20 = 100, cost basis: 5 * 10 = 50, gain: 50
      expect(disposals[1]).toMatchObject({
        quantity: '5.00000000',
        costBasisUsd: '50.00000000',
        proceedsUsd: '100.00000000',
        gainLossUsd: '50.00000000',
      });
    });
  });

  describe('Short-Term vs. Long-Term Capital Gains/Losses Splits', () => {
    it('should split short-term (< 365 days) and long-term (> 365 days) correctly in the summary', async () => {
      // 1. Short Term Acquisition (Lot 1): acquired 10 days before disposal
      const txAcqST = {
        id: 'tx-acq-st',
        userId: 'user-1',
        type: TransactionType.DEPOSIT,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(txAcqST);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 10.0 });
      await service.processTransaction('tx-acq-st');

      // 2. Long Term Acquisition (Lot 2): acquired 400 days before disposal
      const txAcqLT = {
        id: 'tx-acq-lt',
        userId: 'user-1',
        type: TransactionType.DEPOSIT,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2024-12-01T12:00:00Z'), // Far in the past
      } as Transaction;
      transactions.push(txAcqLT);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 10.0 });
      await service.processTransaction('tx-acq-lt');

      // 3. Disposal of Short Term Lot (10 XLM)
      const txDispST = {
        id: 'tx-disp-st',
        userId: 'user-1',
        type: TransactionType.WITHDRAW,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-11T12:00:00Z'), // 10 days later
      } as Transaction;
      transactions.push(txDispST);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 20.0 });
      await service.processTransaction('tx-disp-st');

      // 4. Disposal of Long Term Lot (10 XLM)
      const txDispLT = {
        id: 'tx-disp-lt',
        userId: 'user-1',
        type: TransactionType.WITHDRAW,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-15T12:00:00Z'), // 410 days later
      } as Transaction;
      transactions.push(txDispLT);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 30.0 });
      await service.processTransaction('tx-disp-lt');

      // Check summary for year 2026
      const summary = await service.getSummary('user-1', 2026);
      expect(summary).toMatchObject({
        totalCapitalGainsUsd: 300,
        shortTermGainUsd: 200,
        longTermGainUsd: 100,
        taxYear: 2026,
      });
    });
  });

  describe('Stored PriceSnapshot Immutability', () => {
    it('should use price snapshots stored at transaction completion for all subsequent calculations', async () => {
      // 1. Buy 100 XLM
      const tx = {
        id: 'tx-1',
        userId: 'user-1',
        type: TransactionType.DEPOSIT,
        amount: '100.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(tx);

      // Exchange rate provider returns $5.00
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 5.0 });
      await service.processTransaction('tx-1');

      // Price snapshot table should store $5.00
      const snapshot = priceSnapshots.find((s) => s.transactionId === 'tx-1' && s.currency === 'XLM');
      expect(snapshot).toBeDefined();
      expect(snapshot?.priceUsd).toBe('5');

      // Let's modify the mock exchange rates service to return $10.00
      mockExchangeRatesService.getRate.mockClear();
      mockExchangeRatesService.getRate.mockResolvedValue({ rate: 10.0 });

      // When we query the rate for tx-1, it should fetch $5.00 from price_snapshots table
      const rateUsed = await (service as any).getUsdRate('XLM', 'tx-1');
      expect(rateUsed).toBe('5');
      expect(mockExchangeRatesService.getRate).not.toHaveBeenCalled();
    });

    it('should throw an error and propagate it out if ExchangeRatesService.getRate fails', async () => {
      const tx = {
        id: 'tx-err',
        userId: 'user-err',
        type: TransactionType.DEPOSIT,
        amount: '100.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(tx);

      // Force mockExchangeRatesService.getRate to throw an error
      mockExchangeRatesService.getRate.mockRejectedValueOnce(new Error('Rate service offline'));

      // Expect processTransaction to reject and propagate the error
      await expect(service.processTransaction('tx-err')).rejects.toThrow('Rate service offline');
    });
  });

  describe('Asynchronous Tax Processing non-blocking behavior', () => {
    it('should enqueue the export job and return status immediately', async () => {
      const result = await service.enqueueExportJob('user-1', 2026, TaxExportJurisdiction.US);
      expect(result).toHaveProperty('jobId');
      expect(result.status).toBe(TaxExportStatus.PENDING);
      expect(mockTaxQueue.add).toHaveBeenCalledWith('export-tax-csv', { jobId: result.jobId });
    });
  });

  describe('Acceptance Criteria & CSV Evidence Verification', () => {
    it('Concrete AC Test: Buy 100 XLM @ $10, sell 50 @ $20 -> gain = $500 in summary', async () => {
      // 1. Buy 100 XLM @ $10
      const txAcq = {
        id: 'tx-acq-ac',
        userId: 'user-ac',
        type: TransactionType.DEPOSIT,
        amount: '100.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(txAcq);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 10.0 });
      await service.processTransaction('tx-acq-ac');

      // 2. Sell 50 XLM @ $20
      const txDisp = {
        id: 'tx-disp-ac',
        userId: 'user-ac',
        type: TransactionType.WITHDRAW,
        amount: '50.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-02-01T12:00:00Z'),
      } as Transaction;
      transactions.push(txDisp);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 20.0 });
      await service.processTransaction('tx-disp-ac');

      // 3. Verify gain = $500 in the summary
      const summary = await service.getSummary('user-ac', 2026);
      expect(summary.totalCapitalGainsUsd).toBe(500);
      expect(summary.totalProceedsUsd).toBe(1000);
      expect(summary.totalCostBasisUsd).toBe(500);
    });

    it('Print UK and US CSV outputs for verification', async () => {
      // Setup some mock events for user-csv
      const txAcq = {
        id: 'tx-acq-csv',
        userId: 'user-csv',
        type: TransactionType.DEPOSIT,
        amount: '10.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      } as Transaction;
      transactions.push(txAcq);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 5.00 });
      await service.processTransaction('tx-acq-csv');

      const txDisp = {
        id: 'tx-disp-csv',
        userId: 'user-csv',
        type: TransactionType.WITHDRAW,
        amount: '5.00000000',
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        createdAt: new Date('2026-06-01T12:00:00Z'),
      } as Transaction;
      transactions.push(txDisp);
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 15.00 }); // XLM is $15

      // Setup price snapshot for GBP fallback (e.g. GBP/USD is 1.25)
      const snapGbp = {
        transactionId: 'tx-disp-csv',
        currency: 'GBP',
        priceUsd: '1.25000000',
      } as PriceSnapshot;
      priceSnapshots.push(snapGbp);

      await service.processTransaction('tx-disp-csv');

      // Now query events for user-csv
      const events = await mockTaxEventRepository.find({
        where: { userId: 'user-csv', taxYear: 2026 },
        relations: ['transaction'],
      });

      // Generate US CSV
      const usCsv = await (service as any).generateCsvContent(events, TaxExportJurisdiction.US);
      console.log('--- BEGIN US CSV ---');
      console.log(usCsv);
      console.log('--- END US CSV ---');

      // Generate UK CSV
      const ukCsv = await (service as any).generateCsvContent(events, TaxExportJurisdiction.UK);
      console.log('--- BEGIN UK CSV ---');
      console.log(ukCsv);
      console.log('--- END UK CSV ---');

      expect(usCsv).toContain('Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss');
      expect(ukCsv).toContain('Date,Description,Proceeds (GBP),Allowable Costs (GBP),Gain/Loss (GBP)');
    });
  });
});
