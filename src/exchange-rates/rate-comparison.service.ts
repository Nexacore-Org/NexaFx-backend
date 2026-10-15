import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { firstValueFrom } from 'rxjs';
import { ExchangeRatesService } from './exchange-rates.service';
import Decimal from 'decimal.js';
import { FeesService } from '../fees/fees.service';
import { FeeTransactionType } from '../fees/entities/fee-config.entity';

export interface CompetitorRate {
  provider: string;
  rate: number;
  fee: number;
  youReceive: number;
}

export interface RateComparisonResponse {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  nexafx: { rate: number; fee: number; youReceive: number; provider: string };
  competitors: CompetitorRate[];
  nexafxAdvantage: string;
  disclaimer: string;
}

interface CompetitorRateProvider {
  name: string;
  fetchRate(
    from: string,
    to: string,
  ): Promise<{ rate: Decimal; fee?: Decimal } | null>;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const DISCLAIMER =
  'Competitor rates are indicative and may vary. NexaFX rate includes our markup.';

@Injectable()
export class RateComparisonService {
  private readonly logger = new Logger(RateComparisonService.name);
  private readonly providers: CompetitorRateProvider[];

  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly feesService: FeesService,
  ) {
    this.providers = [
      new WiseProvider(httpService),
      new CentralBankProvider(httpService),
    ];
  }

  async compare(
    from: string,
    to: string,
    amount: number,
  ): Promise<RateComparisonResponse> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    const nexafxRate = await this.exchangeRatesService.getRate(
      fromCode,
      toCode,
    );
    const grossReceive = new Decimal(amount).times(nexafxRate.rate);
    const fee = await this.feesService.calculateFee(
      FeeTransactionType.CONVERT,
      toCode,
      grossReceive.toNumber(),
    );
    const nexafxFee = fee.feeAmount;
    const nexafxYouReceive = new Decimal(amount)
      .times(nexafxRate.rate)
      .minus(nexafxFee)
      .toNumber();

    const competitors: CompetitorRate[] = [];
    for (const provider of this.providers) {
      try {
        const cacheKey = `comp_rate:${provider.name}:${fromCode}:${toCode}`;
        let cached = await this.cacheManager.get<{ rate: string; fee: string }>(
          cacheKey,
        );
        if (!cached) {
          const result = await provider.fetchRate(fromCode, toCode);
          if (result) {
            cached = {
              rate: result.rate.toFixed(8),
              fee: (result.fee ?? new Decimal(0)).toFixed(8),
            };
            await this.cacheManager.set(cacheKey, cached, CACHE_TTL_MS);
          }
        }
        if (cached) {
          const rate = parseFloat(cached.rate);
          const fee = parseFloat(cached.fee);
          const youReceive = new Decimal(amount)
            .times(rate)
            .minus(fee)
            .toNumber();
          competitors.push({ provider: provider.name, rate, fee, youReceive });
        }
      } catch (err) {
        this.logger.warn(
          `Competitor rate fetch failed for ${provider.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    let advantage = 'N/A';
    if (competitors.length > 0) {
      const bestCompetitor = competitors.reduce((best, c) =>
        c.youReceive > best.youReceive ? c : best,
      );
      const diff = Math.round(nexafxYouReceive - bestCompetitor.youReceive);
      advantage =
        diff >= 0
          ? `+${diff.toLocaleString()} ${toCode} vs ${bestCompetitor.provider}`
          : `${diff.toLocaleString()} ${toCode} vs ${bestCompetitor.provider}`;
    }

    return {
      amount,
      fromCurrency: fromCode,
      toCurrency: toCode,
      nexafx: {
        rate: nexafxRate.rate,
        fee: nexafxFee,
        youReceive: nexafxYouReceive,
        provider: 'nexafx',
      },
      competitors,
      nexafxAdvantage: advantage,
      disclaimer: DISCLAIMER,
    };
  }
}

class WiseProvider implements CompetitorRateProvider {
  name = 'Wise';
  constructor(private readonly httpService: HttpService) {}

  async fetchRate(
    from: string,
    to: string,
  ): Promise<{ rate: Decimal; fee?: Decimal } | null> {
    try {
      const url = `https://api.wise.com/v1/rates?source=${from}&target=${to}`;
      const resp = await firstValueFrom(
        this.httpService.get(url, { timeout: 5000 }),
      );
      const rate = resp.data?.[0]?.rate;
      if (!rate) return null;
      return { rate: new Decimal(rate), fee: new Decimal(0) };
    } catch {
      return null;
    }
  }
}

class CentralBankProvider implements CompetitorRateProvider {
  name = 'Central Bank (CBN)';
  constructor(private readonly httpService: HttpService) {}

  async fetchRate(
    from: string,
    to: string,
  ): Promise<{ rate: Decimal; fee?: Decimal } | null> {
    if (from !== 'USD' || to !== 'NGN') return null;
    try {
      const url =
        'https://www.cbn.gov.ng/api/exchangerates/get-rate?format=json';
      const resp = await firstValueFrom(
        this.httpService.get(url, { timeout: 5000 }),
      );
      const usdRate = resp.data?.find((r: any) => r.currency === 'USD');
      if (!usdRate) return null;
      const rate = new Decimal(usdRate.rate);
      return { rate, fee: new Decimal(0) };
    } catch {
      return null;
    }
  }
}
