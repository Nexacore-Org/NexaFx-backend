import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RebalancingPolicy,
  RebalanceFrequency,
} from './entities/rebalancing-policy.entity';
import { CreateOrUpdatePolicyDto } from './dto/rebalancing-policy.dto';
import { WalletService } from '../wallet/wallet.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { ConversionsService } from '../conversions/conversions.service';

export interface TradeStep {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmountEstimated: number;
}

@Injectable()
export class RebalancingService {
  private readonly logger = new Logger(RebalancingService.name);

  constructor(
    @InjectRepository(RebalancingPolicy)
    private readonly policyRepo: Repository<RebalancingPolicy>,
    private readonly walletService: WalletService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly conversionsService: ConversionsService,
  ) {}

  async getPolicy(userId: string) {
    const policy = await this.policyRepo.findOne({ where: { userId } });
    if (!policy) {
      throw new NotFoundException('Rebalancing policy not found');
    }
    const driftStatus = await this.checkDrift(userId);
    return { policy, driftStatus };
  }

  async upsertPolicy(userId: string, dto: CreateOrUpdatePolicyDto) {
    const totalPercent = dto.allocations.reduce(
      (sum, item) => sum + item.targetPercent,
      0,
    );
    if (Math.abs(totalPercent - 100) > 0.01) {
      throw new BadRequestException(
        'Target allocations percentage must sum to 100%',
      );
    }

    let policy = await this.policyRepo.findOne({ where: { userId } });
    if (policy) {
      Object.assign(policy, dto);
    } else {
      policy = this.policyRepo.create({ userId, ...dto });
    }

    return this.policyRepo.save(policy);
  }

  async deactivatePolicy(userId: string) {
    const policy = await this.policyRepo.findOne({ where: { userId } });
    if (!policy) throw new NotFoundException('Policy not found');

    policy.isActive = false;
    return this.policyRepo.save(policy);
  }

  async checkDrift(userId: string) {
    const policy = await this.policyRepo.findOne({ where: { userId } });
    if (!policy) throw new NotFoundException('Policy not configured');

    const balances = await this.walletService.getBalances(userId);
    const rates = await this.exchangeRateService.getRatesToUsd();

    let totalPortfolioUsd = 0;
    const currencyValuesUsd: Record<string, number> = {};

    for (const b of balances) {
      const rateUsd = rates[b.currency] || 0;
      const usdValue = Number(b.amount) * rateUsd;
      currencyValuesUsd[b.currency] = usdValue;
      totalPortfolioUsd += usdValue;
    }

    let needsRebalancing = false;
    const drifts = policy.allocations.map((alloc) => {
      const actualUsd = currencyValuesUsd[alloc.currency] || 0;
      const actualPercent =
        totalPortfolioUsd > 0 ? (actualUsd / totalPortfolioUsd) * 100 : 0;
      const drift = actualPercent - alloc.targetPercent;

      if (Math.abs(drift) > policy.driftThresholdPercent) {
        needsRebalancing = true;
      }

      return {
        currency: alloc.currency,
        target: alloc.targetPercent,
        actual: Number(actualPercent.toFixed(2)),
        drift: Number(drift.toFixed(2)),
      };
    });

    return { needsRebalancing, drifts, totalPortfolioUsd };
  }

  async calculateTrades(userId: string): Promise<TradeStep[]> {
    const { drifts, totalPortfolioUsd } = await this.checkDrift(userId);
    const rates = await this.exchangeRateService.getRatesToUsd();

    const overweight = drifts
      .filter((d) => d.drift > 0)
      .sort((a, b) => b.drift - a.drift);
    const underweight = drifts
      .filter((d) => d.drift < 0)
      .sort((a, b) => a.drift - b.drift);

    const trades: TradeStep[] = [];

    for (const ow of overweight) {
      let excessUsd = (ow.drift / 100) * totalPortfolioUsd;

      for (const uw of underweight) {
        if (excessUsd <= 0.01) break;
        let deficitUsd = (Math.abs(uw.drift) / 100) * totalPortfolioUsd;
        if (deficitUsd <= 0.01) continue;

        const tradeUsd = Math.min(excessUsd, deficitUsd);
        const fromAmount = tradeUsd / (rates[ow.currency] || 1);
        const toAmountEstimated = tradeUsd / (rates[uw.currency] || 1);

        trades.push({
          fromCurrency: ow.currency,
          toCurrency: uw.currency,
          fromAmount: Number(fromAmount.toFixed(6)),
          toAmountEstimated: Number(toAmountEstimated.toFixed(6)),
        });

        excessUsd -= tradeUsd;
        uw.drift += (tradeUsd / totalPortfolioUsd) * 100; // adjust remaining deficit
      }
    }

    return trades;
  }

  async execute(userId: string) {
    const policy = await this.policyRepo.findOne({ where: { userId } });
    if (!policy || !policy.isActive) {
      throw new BadRequestException('Active policy required for rebalancing');
    }

    const trades = await this.calculateTrades(userId);
    const results = [];

    for (const trade of trades) {
      try {
        const quote = await this.conversionsService.quote({
          fromCurrency: trade.fromCurrency,
          toCurrency: trade.toCurrency,
          amount: trade.fromAmount,
        });

        const execution = await this.conversionsService.execute(userId, quote.id);
        results.push({ trade, status: 'SUCCESS', executionId: execution.id });
      } catch (err: any) {
        this.logger.error(
          `Partial rebalance failure for ${trade.fromCurrency}->${trade.toCurrency}: ${err.message}`,
        );
        results.push({ trade, status: 'FAILED', error: err.message });
      }
    }

    policy.lastRebalancedAt = new Date();
    await this.policyRepo.save(policy);

    return { executedTrades: results, rebalancedAt: policy.lastRebalancedAt };
  }
}