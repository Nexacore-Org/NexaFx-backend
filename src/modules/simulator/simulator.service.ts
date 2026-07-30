import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ExchangeRateSnapshot } from '../exchange-rate/entities/exchange-rate-snapshot.entity';
import { Wallet } from '../wallets/entities/wallet.entity';

const DISCLAIMER = 'This is a hypothetical simulation for educational purposes only. Past performance does not guarantee future results.';
const CACHE_TTL = 3600;

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  constructor(
    @InjectRepository(ExchangeRateSnapshot)
    private readonly exchangeRateSnapshotRepo: Repository<ExchangeRateSnapshot>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async targetPriceScenario(
    userId: string,
    targetRate: number,
    currency: string,
    toCurrency: string,
  ) {
    const cacheKey = `simulator:target:${userId}:${targetRate}:${currency}:${toCurrency}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const wallet = await this.walletRepo.findOne({
      where: { userId, currency },
    });

    const balance = wallet ? parseFloat(wallet.balance.toString()) : 0;

    const currentRateSnapshot = await this.exchangeRateSnapshotRepo.findOne({
      where: { currency, toCurrency },
      order: { createdAt: 'DESC' },
    });

    const currentRate = currentRateSnapshot
      ? parseFloat(currentRateSnapshot.rate.toString())
      : 0;

    const currentValueTo = balance * currentRate;
    const projectedValueTo = balance * targetRate;
    const changePct = currentRate > 0
      ? ((targetRate - currentRate) / currentRate) * 100
      : 0;

    const result = {
      currentRate,
      targetRate,
      currentValueTo,
      projectedValueTo,
      changePct,
      disclaimer: DISCLAIMER,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async historicalBacktest(
    currency: string,
    toCurrency: string,
    daysAgo: number,
    amount: number,
  ) {
    const cacheKey = `simulator:backtest:${currency}:${toCurrency}:${daysAgo}:${amount}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const historicalSnapshot = await this.exchangeRateSnapshotRepo.findOne({
      where: { currency, toCurrency },
      order: { createdAt: 'ASC' },
    });

    const purchaseRate = historicalSnapshot
      ? parseFloat(historicalSnapshot.rate.toString())
      : 0;

    const currentSnapshot = await this.exchangeRateSnapshotRepo.findOne({
      where: { currency, toCurrency },
      order: { createdAt: 'DESC' },
    });

    const currentRate = currentSnapshot
      ? parseFloat(currentSnapshot.rate.toString())
      : 0;

    const purchaseCost = amount * purchaseRate;
    const currentValue = amount * currentRate;
    const gainLoss = currentValue - purchaseCost;
    const gainLossPct = purchaseCost > 0 ? (gainLoss / purchaseCost) * 100 : 0;

    const result = {
      purchaseRate,
      currentRate,
      purchaseCost,
      currentValue,
      gainLoss,
      gainLossPct,
      disclaimer: DISCLAIMER,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async dcaCalculator(
    userId: string,
    monthlyAmount: number,
    currency: string,
    toCurrency: string,
    months: number,
  ) {
    const cacheKey = `simulator:dca:${userId}:${monthlyAmount}:${currency}:${toCurrency}:${months}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const monthlyRates: Array<{ month: string; rate: number }> = [];
    let totalUnits = 0;

    for (let i = months - 1; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - i);

      const snapshot = await this.exchangeRateSnapshotRepo
        .createQueryBuilder('snapshot')
        .where('snapshot.currency = :currency', { currency })
        .andWhere('snapshot.to_currency = :toCurrency', { toCurrency })
        .andWhere('snapshot.created_at <= :targetDate', { targetDate })
        .orderBy('snapshot.created_at', 'DESC')
        .getOne();

      const rate = snapshot ? parseFloat(snapshot.rate.toString()) : 0;
      monthlyRates.push({
        month: targetDate.toISOString().slice(0, 7),
        rate,
      });

      if (rate > 0) {
        totalUnits += monthlyAmount / rate;
      }
    }

    const totalInvested = monthlyAmount * months;

    const currentSnapshot = await this.exchangeRateSnapshotRepo.findOne({
      where: { currency, toCurrency },
      order: { createdAt: 'DESC' },
    });

    const currentRate = currentSnapshot
      ? parseFloat(currentSnapshot.rate.toString())
      : 0;

    const currentValue = totalUnits * currentRate;
    const gainLoss = currentValue - totalInvested;
    const gainLossPct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

    const result = {
      totalInvested,
      currentValue,
      gainLoss,
      gainLossPct,
      monthlyRates,
      disclaimer: DISCLAIMER,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }
}
