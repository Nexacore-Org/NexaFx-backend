import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioSnapshot, HoldingSnapshot } from './entities/portfolio-snapshot.entity';
import { WalletsService } from '../wallets/wallets.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

export interface PortfolioValuation {
  totalValueUsd: number;
  holdings: HoldingSnapshot[];
  snapshotId: string;
  createdAt: Date;
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepo: Repository<PortfolioSnapshot>,
    private readonly walletsService: WalletsService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  /**
   * Compute the current portfolio value for a user by aggregating all wallet
   * balances and converting each asset to USD via the live exchange-rate cache.
   * Persists a snapshot row so historical trends can be queried later.
   */
  async computeAndSnapshot(userId: string): Promise<PortfolioValuation> {
    const wallets = await this.walletsService.listWallets(userId);

    // Accumulate per-currency totals across all wallets
    const currencyTotals: Record<string, number> = {};
    for (const wallet of wallets) {
      for (const balance of wallet.balances) {
        const currency = balance.asset.toUpperCase();
        const amount = parseFloat(balance.balance) || 0;
        currencyTotals[currency] = (currencyTotals[currency] ?? 0) + amount;
      }
    }

    // Convert each holding to USD using the exchange-rate service
    let totalValueUsd = 0;
    const holdingsRaw: Array<{ currency: string; amount: number; usdValue: number }> = [];

    for (const [currency, amount] of Object.entries(currencyTotals)) {
      let usdValue = 0;
      try {
        const rateResult = await this.exchangeRatesService.getRate(currency, 'USD');
        usdValue = amount * rateResult.rate;
      } catch {
        // If rate unavailable, treat contribution as 0 but still record the holding
        this.logger.warn(`Exchange rate unavailable for ${currency}->USD; holding recorded with 0 USD value`);
      }
      totalValueUsd += usdValue;
      holdingsRaw.push({ currency, amount, usdValue });
    }

    // Compute percentage share per holding
    const holdings: HoldingSnapshot[] = holdingsRaw.map((h) => ({
      ...h,
      percent: totalValueUsd > 0 ? Number(((h.usdValue / totalValueUsd) * 100).toFixed(4)) : 0,
    }));

    const snapshot = await this.snapshotRepo.save(
      this.snapshotRepo.create({ userId, totalValueUsd, holdings }),
    );

    return {
      totalValueUsd,
      holdings,
      snapshotId: snapshot.id,
      createdAt: snapshot.createdAt,
    };
  }

  /**
   * Return the latest snapshot for a user without recomputing.
   * Throws if no snapshot exists yet (client should call GET /portfolio/value first).
   */
  async getLatestSnapshot(userId: string): Promise<PortfolioSnapshot> {
    const snapshot = await this.snapshotRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!snapshot) {
      throw new NotFoundException(
        'No portfolio snapshot found. Request GET /portfolio/value to generate one.',
      );
    }
    return snapshot;
  }

  /**
   * Return a paginated history of snapshots so clients can chart portfolio
   * growth over time.
   */
  async getHistory(userId: string, limit = 30): Promise<PortfolioSnapshot[]> {
    return this.snapshotRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 90), // hard-cap at 90 to keep response sizes manageable
    });
  }
}
