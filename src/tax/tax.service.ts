import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Decimal from 'decimal.js';

import { CostBasisLot } from './entities/cost-basis-lot.entity';
import { TaxEvent, TaxEventType } from './entities/tax-event.entity';
import { PriceSnapshot } from './entities/price-snapshot.entity';
import { TaxExportJob, TaxExportJurisdiction, TaxExportStatus } from './entities/tax-export-job.entity';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/entities/transaction.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { TAX_QUEUE } from '../modules/queues/queue.constants';

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(
    @InjectRepository(CostBasisLot)
    private readonly costBasisLotRepository: Repository<CostBasisLot>,
    @InjectRepository(TaxEvent)
    private readonly taxEventRepository: Repository<TaxEvent>,
    @InjectRepository(PriceSnapshot)
    private readonly priceSnapshotRepository: Repository<PriceSnapshot>,
    @InjectRepository(TaxExportJob)
    private readonly taxExportJobRepository: Repository<TaxExportJob>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly exchangeRatesService: ExchangeRatesService,
    @InjectQueue(TAX_QUEUE)
    private readonly taxQueue: Queue,
  ) {}

  /**
   * Process a successful transaction asynchronously for tax purposes
   */
  async processTransaction(transactionId: string): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      this.logger.warn(`Transaction ${transactionId} not found in database.`);
      return;
    }

    if (transaction.status !== TransactionStatus.SUCCESS) {
      this.logger.debug(`Skipping tax processing for transaction ${transactionId} since status is ${transaction.status}`);
      return;
    }

    // Check if we already processed this transaction for tax
    const alreadyProcessed = await this.taxEventRepository.findOne({
      where: { transactionId },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Transaction ${transactionId} has already been processed for tax.`);
      return;
    }

    // 1. Fetch and save immutable price snapshots
    await this.savePriceSnapshots(transaction);

    const userId = transaction.userId;
    const date = transaction.createdAt;

    // 2. Perform logic based on transaction type
    if (transaction.type === TransactionType.DEPOSIT) {
      const rateUsd = new Decimal(await this.getUsdRate(transaction.currency, transaction.id));
      const qty = new Decimal(transaction.amount);
      const costBasisUsd = qty.mul(rateUsd);

      // Create cost basis lot
      const lot = this.costBasisLotRepository.create({
        userId,
        currency: transaction.currency.toUpperCase(),
        quantity: qty.toFixed(8),
        costBasisUsd: costBasisUsd.toFixed(8),
        acquiredAt: date,
        sourceTransactionId: transaction.id,
        remainingQuantity: qty.toFixed(8),
      });
      await this.costBasisLotRepository.save(lot);

      // Create tax acquisition event
      const event = this.taxEventRepository.create({
        userId,
        transactionId: transaction.id,
        eventType: TaxEventType.ACQUISITION,
        currency: transaction.currency.toUpperCase(),
        quantity: qty.toFixed(8),
        priceUsdAtEvent: rateUsd.toFixed(8),
        costBasisUsd: costBasisUsd.toFixed(8),
        proceedsUsd: null,
        gainLossUsd: null,
        holdingPeriodDays: null,
        acquiredAt: date,
        taxYear: date.getFullYear(),
      });
      await this.taxEventRepository.save(event);

      this.logger.log(`Processed DEPOSIT tax event for transaction ${transaction.id}`);
    } else if (transaction.type === TransactionType.WITHDRAW) {
      const rateUsd = new Decimal(await this.getUsdRate(transaction.currency, transaction.id));
      const qty = new Decimal(transaction.amount);

      await this.processDisposal(userId, transaction, transaction.currency, qty, rateUsd);
      this.logger.log(`Processed WITHDRAW tax event for transaction ${transaction.id}`);
    } else if (transaction.type === TransactionType.SWAP) {
      // SWAP represents disposal of source currency and acquisition of destination currency
      const sourceCurrency = transaction.currency;
      const destCurrency = transaction.toCurrency;
      const sourceQty = new Decimal(transaction.amount);
      const destQty = new Decimal(transaction.toAmount || '0');

      if (!destCurrency || destQty.isZero()) {
        this.logger.warn(`Swap transaction ${transaction.id} missing destination details.`);
        return;
      }

      const sourceRateUsd = new Decimal(await this.getUsdRate(sourceCurrency, transaction.id));
      const destRateUsd = new Decimal(await this.getUsdRate(destCurrency, transaction.id));

      // Process disposal of source currency
      await this.processDisposal(userId, transaction, sourceCurrency, sourceQty, sourceRateUsd);

      // Process acquisition of destination currency
      const destCostBasisUsd = destQty.mul(destRateUsd);
      const lot = this.costBasisLotRepository.create({
        userId,
        currency: destCurrency.toUpperCase(),
        quantity: destQty.toFixed(8),
        costBasisUsd: destCostBasisUsd.toFixed(8),
        acquiredAt: date,
        sourceTransactionId: transaction.id,
        remainingQuantity: destQty.toFixed(8),
      });
      await this.costBasisLotRepository.save(lot);

      const event = this.taxEventRepository.create({
        userId,
        transactionId: transaction.id,
        eventType: TaxEventType.ACQUISITION,
        currency: destCurrency.toUpperCase(),
        quantity: destQty.toFixed(8),
        priceUsdAtEvent: destRateUsd.toFixed(8),
        costBasisUsd: destCostBasisUsd.toFixed(8),
        proceedsUsd: null,
        gainLossUsd: null,
        holdingPeriodDays: null,
        acquiredAt: date,
        taxYear: date.getFullYear(),
      });
      await this.taxEventRepository.save(event);

      this.logger.log(`Processed SWAP tax events for transaction ${transaction.id}`);
    }
  }

  /**
   * Helper to fetch and save price snapshots at transaction completion
   */
  private async savePriceSnapshots(transaction: Transaction): Promise<void> {
    const currenciesToFetch = new Set<string>();
    currenciesToFetch.add(transaction.currency.toUpperCase());
    if (transaction.toCurrency) {
      currenciesToFetch.add(transaction.toCurrency.toUpperCase());
    }
    currenciesToFetch.add('GBP'); // UK HMRC compliance requires conversion from USD back to GBP using stored rate

    for (const c of currenciesToFetch) {
      const currency = c.toUpperCase();
      const existing = await this.priceSnapshotRepository.findOne({
        where: { transactionId: transaction.id, currency },
      });
      if (existing) continue;

      let priceUsd = '1.00000000';
      if (currency !== 'USD' && currency !== 'USDC') {
        try {
          const rate = await this.exchangeRatesService.getRate(currency, 'USD');
          priceUsd = rate.rate.toString();
        } catch (err: any) {
          this.logger.error(`Failed to fetch exchange rate snapshot for ${currency} at completion: ${err.message}`);
          throw err;
        }
      }

      const snapshot = this.priceSnapshotRepository.create({
        transactionId: transaction.id,
        currency,
        priceUsd,
      });
      await this.priceSnapshotRepository.save(snapshot);
    }
  }

  /**
   * Helper to retrieve USD rate from price snapshots
   */
  private async getUsdRate(currency: string, transactionId: string): Promise<string> {
    const uc = currency.toUpperCase();
    if (uc === 'USD' || uc === 'USDC') {
      return '1.00000000';
    }

    const snapshot = await this.priceSnapshotRepository.findOne({
      where: { transactionId, currency: uc },
    });
    if (snapshot) {
      return snapshot.priceUsd;
    }

    // Fallback if worker missed it
    try {
      const rate = await this.exchangeRatesService.getRate(uc, 'USD');
      return rate.rate.toString();
    } catch {
      return '1.00000000';
    }
  }

  /**
   * FIFO Disposal logic matching against cost basis lots
   */
  private async processDisposal(
    userId: string,
    transaction: Transaction,
    disposalCurrency: string,
    disposalQty: Decimal,
    disposalPriceUsd: Decimal,
  ): Promise<void> {
    const lots = await this.costBasisLotRepository.find({
      where: { userId, currency: disposalCurrency.toUpperCase() },
      order: { acquiredAt: 'ASC' },
    });

    let remainingToDispose = disposalQty;

    for (const lot of lots) {
      const lotRemaining = new Decimal(lot.remainingQuantity);
      if (lotRemaining.isZero()) continue;
      if (remainingToDispose.isZero()) break;

      const matchQty = Decimal.min(remainingToDispose, lotRemaining);

      // Update remaining quantity in database lot
      lot.remainingQuantity = lotRemaining.minus(matchQty).toFixed(8);
      await this.costBasisLotRepository.save(lot);

      const lotTotalQty = new Decimal(lot.quantity);
      const lotCostBasisUsd = new Decimal(lot.costBasisUsd);
      const costBasisUsd = matchQty.mul(lotCostBasisUsd.div(lotTotalQty));
      
      const proceedsUsd = matchQty.mul(disposalPriceUsd);
      const gainLossUsd = proceedsUsd.minus(costBasisUsd);

      const holdingPeriodDays = Math.ceil(
        (transaction.createdAt.getTime() - lot.acquiredAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      const taxEvent = this.taxEventRepository.create({
        userId,
        transactionId: transaction.id,
        eventType: TaxEventType.DISPOSAL,
        currency: disposalCurrency.toUpperCase(),
        quantity: matchQty.toFixed(8),
        priceUsdAtEvent: disposalPriceUsd.toFixed(8),
        costBasisUsd: costBasisUsd.toFixed(8),
        proceedsUsd: proceedsUsd.toFixed(8),
        gainLossUsd: gainLossUsd.toFixed(8),
        holdingPeriodDays,
        acquiredAt: lot.acquiredAt,
        taxYear: transaction.createdAt.getFullYear(),
      });
      await this.taxEventRepository.save(taxEvent);

      remainingToDispose = remainingToDispose.minus(matchQty);
    }

    // Handle remaining portion when user didn't have enough lots (e.g. short sale or incomplete historical lots)
    if (remainingToDispose.greaterThan(0)) {
      const proceedsUsd = remainingToDispose.mul(disposalPriceUsd);
      const taxEvent = this.taxEventRepository.create({
        userId,
        transactionId: transaction.id,
        eventType: TaxEventType.DISPOSAL,
        currency: disposalCurrency.toUpperCase(),
        quantity: remainingToDispose.toFixed(8),
        priceUsdAtEvent: disposalPriceUsd.toFixed(8),
        costBasisUsd: '0.00000000',
        proceedsUsd: proceedsUsd.toFixed(8),
        gainLossUsd: proceedsUsd.toFixed(8),
        holdingPeriodDays: null,
        acquiredAt: null,
        taxYear: transaction.createdAt.getFullYear(),
      });
      await this.taxEventRepository.save(taxEvent);
    }
  }

  /**
   * Get annual tax summary for a given year
   */
  async getSummary(userId: string, year: number) {
    const events = await this.taxEventRepository.find({
      where: { userId, taxYear: year, eventType: TaxEventType.DISPOSAL },
    });

    let totalCapitalGainsUsd = new Decimal(0);
    let totalProceedsUsd = new Decimal(0);
    let totalCostBasisUsd = new Decimal(0);
    let shortTermGainUsd = new Decimal(0);
    let longTermGainUsd = new Decimal(0);

    for (const event of events) {
      const gl = new Decimal(event.gainLossUsd || '0');
      const proceeds = new Decimal(event.proceedsUsd || '0');
      const cb = new Decimal(event.costBasisUsd || '0');

      totalProceedsUsd = totalProceedsUsd.plus(proceeds);
      totalCostBasisUsd = totalCostBasisUsd.plus(cb);
      totalCapitalGainsUsd = totalCapitalGainsUsd.plus(gl);

      const days = event.holdingPeriodDays;
      if (days !== null && days > 365) {
        longTermGainUsd = longTermGainUsd.plus(gl);
      } else {
        shortTermGainUsd = shortTermGainUsd.plus(gl);
      }
    }

    return {
      totalCapitalGainsUsd: totalCapitalGainsUsd.toNumber(),
      totalProceedsUsd: totalProceedsUsd.toNumber(),
      totalCostBasisUsd: totalCostBasisUsd.toNumber(),
      netGainLossUsd: totalCapitalGainsUsd.toNumber(),
      shortTermGainUsd: shortTermGainUsd.toNumber(),
      longTermGainUsd: longTermGainUsd.toNumber(),
      taxYear: year,
    };
  }

  /**
   * Get paginated list of tax events
   */
  async getEvents(
    userId: string,
    page: number = 1,
    limit: number = 20,
    currency?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { userId };

    if (currency) {
      where.currency = currency.toUpperCase();
    }

    const [events, total] = await this.taxEventRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create and enqueue an async tax export job
   */
  async enqueueExportJob(
    userId: string,
    year: number,
    jurisdiction: TaxExportJurisdiction,
  ): Promise<any> {
    const job = this.taxExportJobRepository.create({
      userId,
      year,
      jurisdiction,
      status: TaxExportStatus.PENDING,
    });
    const saved = await this.taxExportJobRepository.save(job);

    await this.taxQueue.add('export-tax-csv', { jobId: saved.id });

    return {
      jobId: saved.id,
      status: saved.status,
    };
  }

  /**
   * Get status of an export job
   */
  async getExportJobStatus(userId: string, jobId: string) {
    const job = await this.taxExportJobRepository.findOne({
      where: { id: jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('Tax export job not found.');
    }

    return {
      jobId: job.id,
      status: job.status,
      csv: job.csv,
      errorMessage: job.errorMessage,
    };
  }

  /**
   * Process the export job in the background (called by processor)
   */
  async processExportJob(jobId: string): Promise<void> {
    const job = await this.taxExportJobRepository.findOne({
      where: { id: jobId },
    });
    if (!job) {
      this.logger.error(`Export job ${jobId} not found.`);
      return;
    }

    await this.taxExportJobRepository.update(jobId, {
      status: TaxExportStatus.PROCESSING,
    });

    try {
      const events = await this.taxEventRepository.find({
        where: { userId: job.userId, taxYear: job.year },
        relations: ['transaction'],
        order: { createdAt: 'ASC' },
      });

      const csvContent = await this.generateCsvContent(events, job.jurisdiction);

      await this.taxExportJobRepository.update(jobId, {
        status: TaxExportStatus.COMPLETED,
        csv: csvContent,
      });
    } catch (err: any) {
      this.logger.error(`Failed to process export job ${jobId}: ${err.message}`);
      await this.taxExportJobRepository.update(jobId, {
        status: TaxExportStatus.FAILED,
        errorMessage: err.message,
      });
    }
  }

  /**
   * Helper to generate CSV content for a list of tax events and jurisdiction
   */
  private async generateCsvContent(events: TaxEvent[], jurisdiction: TaxExportJurisdiction): Promise<string> {
    if (jurisdiction === TaxExportJurisdiction.US) {
      // US/IRS 8949: Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss
      let csv = 'Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss\n';
      for (const event of events) {
        if (event.eventType !== TaxEventType.DISPOSAL) continue;

        const dateAcquired = event.acquiredAt ? event.acquiredAt.toISOString().split('T')[0] : 'Various';
        const dateSold = event.transaction.createdAt.toISOString().split('T')[0];
        const desc = `Disposal of ${event.quantity} ${event.currency}`;

        csv += `"${desc}","${dateAcquired}","${dateSold}",${parseFloat(event.proceedsUsd || '0').toFixed(2)},${parseFloat(event.costBasisUsd || '0').toFixed(2)},${parseFloat(event.gainLossUsd || '0').toFixed(2)}\n`;
      }
      return csv;
    } else if (jurisdiction === TaxExportJurisdiction.UK) {
      // UK/HMRC: Date,Description,Proceeds (GBP),Allowable Costs (GBP),Gain/Loss (GBP)
      let csv = 'Date,Description,Proceeds (GBP),Allowable Costs (GBP),Gain/Loss (GBP)\n';
      for (const event of events) {
        if (event.eventType !== TaxEventType.DISPOSAL) continue;

        // Fetch stored GBP/USD snapshot rate at completion time
        const gbpUsdSnapshot = await this.priceSnapshotRepository.findOne({
          where: { transactionId: event.transactionId, currency: 'GBP' },
        });
        const rateGbpUsd = new Decimal(gbpUsdSnapshot?.priceUsd || '1.25000000');

        const dateSold = event.transaction.createdAt.toISOString().split('T')[0];
        const desc = `Disposal of ${event.quantity} ${event.currency}`;

        // Convert USD amounts to GBP by dividing by stored GBP/USD rate
        const proceedsGbp = new Decimal(event.proceedsUsd || '0').div(rateGbpUsd);
        const costBasisGbp = new Decimal(event.costBasisUsd || '0').div(rateGbpUsd);
        const gainLossGbp = proceedsGbp.minus(costBasisGbp);

        csv += `"${dateSold}","${desc}",${proceedsGbp.toFixed(2)},${costBasisGbp.toFixed(2)},${gainLossGbp.toFixed(2)}\n`;
      }
      return csv;
    } else {
      // GENERIC: Date,Description,Proceeds (USD),Cost Basis (USD),Gain/Loss (USD)
      let csv = 'Date,Description,Proceeds (USD),Cost Basis (USD),Gain/Loss (USD)\n';
      for (const event of events) {
        if (event.eventType !== TaxEventType.DISPOSAL) continue;

        const dateSold = event.transaction.createdAt.toISOString().split('T')[0];
        const desc = `Disposal of ${event.quantity} ${event.currency}`;

        csv += `"${dateSold}","${desc}",${parseFloat(event.proceedsUsd || '0').toFixed(2)},${parseFloat(event.costBasisUsd || '0').toFixed(2)},${parseFloat(event.gainLossUsd || '0').toFixed(2)}\n`;
      }
      return csv;
    }
  }
}
