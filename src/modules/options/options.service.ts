import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  OptionContract,
  OptionStatus,
  OptionType,
} from './entities/option-contract.entity';
import { ExchangeRateSnapshot } from '../exchange-rates/entities/exchange-rate-snapshot.entity';
import { WalletsService } from '../wallets/wallets.service';

@Injectable()
export class OptionsService {
  private readonly logger = new Logger(OptionsService.name);

  constructor(
    @InjectRepository(OptionContract)
    private readonly contractRepo: Repository<OptionContract>,
    @InjectRepository(ExchangeRateSnapshot)
    private readonly rateRepo: Repository<ExchangeRateSnapshot>,
    private readonly walletsService: WalletsService,
  ) {}

  async getPremium(dto: {
    strikePrice: string;
    expiryDate: string;
    contractSize: string;
  }) {
    const currentRate = await this.getCurrentRate();
    const volatility = await this.computeVolatility();

    const strike = Number(dto.strikePrice);
    const expiry = new Date(dto.expiryDate);
    const now = new Date();
    const timeToExpiryYears =
      Math.max(expiry.getTime() - now.getTime(), 0) / (365.25 * 24 * 60 * 60 * 1000);

    const riskFreeRate = 0.05;

    const d1 =
      (Math.log(currentRate / strike) +
        (riskFreeRate + 0.5 * volatility ** 2) * timeToExpiryYears) /
      (volatility * Math.sqrt(timeToExpiryYears || 1));

    const d2 = d1 - volatility * Math.sqrt(timeToExpiryYears || 1);

    const nd1 = this.normalCDF(d1);
    const nd2 = this.normalCDF(d2);

    const callPrice =
      currentRate * nd1 -
      strike * Math.exp(-riskFreeRate * timeToExpiryYears) * nd2;

    const premium = Math.max(callPrice * Number(dto.contractSize), 0);
    const strikePercent = (strike / currentRate) * 100;
    const annualizedVol = volatility * Math.sqrt(365);

    return {
      premium: premium.toFixed(8),
      annualizedVol: annualizedVol.toFixed(8),
      currentRate: currentRate.toFixed(8),
      strikePercent: strikePercent.toFixed(2),
    };
  }

  async createContract(
    userId: string,
    dto: {
      strikePrice: string;
      expiryDate: string;
      contractSize: string;
    },
  ): Promise<OptionContract> {
    const premiumQuote = await this.getPremium(dto);

    const balance = await this.walletsService.getBalance(
      userId,
      'XLM',
    );
    if (Number(balance) < Number(dto.contractSize)) {
      throw new BadRequestException(
        `Insufficient balance. Required: ${dto.contractSize} XLM`,
      );
    }

    await this.walletsService.lockBalance(
      userId,
      'XLM',
      dto.contractSize,
    );

    const contract = this.contractRepo.create({
      userId,
      type: OptionType.CALL,
      underlyingCurrency: 'XLM',
      settlementCurrency: 'NGN',
      strikePrice: dto.strikePrice,
      expiryDate: dto.expiryDate,
      contractSize: dto.contractSize,
      premium: premiumQuote.premium,
      status: OptionStatus.ACTIVE,
    });

    return this.contractRepo.save(contract);
  }

  @Cron('0 * * * *')
  async settleExpiry(): Promise<void> {
    const now = new Date();

    const expiredContracts = await this.contractRepo.find({
      where: {
        status: OptionStatus.ACTIVE,
        expiryDate: LessThanOrEqual(
          now.toISOString().slice(0, 10),
        ),
      },
    });

    for (const contract of expiredContracts) {
      try {
        const currentRate = await this.getCurrentRate();

        if (Number(currentRate) >= Number(contract.strikePrice)) {
          await this.exerciseContract(contract, currentRate);
        } else {
          await this.expireContract(contract);
        }
      } catch (err) {
        this.logger.error(
          `Failed to settle contract ${contract.id}: ${err.message}`,
        );
      }
    }
  }

  async exerciseContract(
    contract: OptionContract,
    currentRate: string,
  ): Promise<void> {
    const payout =
      (Number(currentRate) - Number(contract.strikePrice)) *
      Number(contract.contractSize);

    await this.walletsService.unlockBalance(
      contract.userId,
      'XLM',
      contract.contractSize,
    );

    if (payout > 0) {
      await this.walletsService.credit(
        contract.userId,
        'NGN',
        payout.toFixed(8),
      );
    }

    contract.status = OptionStatus.EXERCISED;
    contract.exercisedAt = new Date();
    await this.contractRepo.save(contract);

    this.logger.log(
      `Contract ${contract.id} exercised. Payout: ${payout.toFixed(2)} NGN`,
    );
  }

  async expireContract(contract: OptionContract): Promise<void> {
    await this.walletsService.unlockBalance(
      contract.userId,
      'XLM',
      contract.contractSize,
    );

    contract.status = OptionStatus.EXPIRED;
    await this.contractRepo.save(contract);

    this.logger.log(`Contract ${contract.id} expired (out of the money)`);
  }

  async getPnL(userId: string) {
    const contracts = await this.contractRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const settled = contracts.filter(
      (c) =>
        c.status === OptionStatus.EXERCISED ||
        c.status === OptionStatus.EXPIRED,
    );

    let totalPnL = 0;
    const details = settled.map((c) => {
      let pnl = 0;
      if (c.status === OptionStatus.EXERCISED && c.exercisedAt) {
        const rateAtExercise = Number(c.strikePrice);
        pnl =
          rateAtExercise * Number(c.contractSize) -
          Number(c.premium);
      } else {
        pnl = -Number(c.premium);
      }
      totalPnL += pnl;
      return {
        id: c.id,
        type: c.type,
        strikePrice: c.strikePrice,
        contractSize: c.contractSize,
        premium: c.premium,
        status: c.status,
        expiryDate: c.expiryDate,
        exercisedAt: c.exercisedAt,
        pnl: pnl.toFixed(8),
      };
    });

    return {
      totalPnL: totalPnL.toFixed(8),
      contractCount: settled.length,
      details,
    };
  }

  private async getCurrentRate(): Promise<string> {
    const latest = await this.rateRepo.findOne({
      where: { currencyPair: 'XLM/NGN' },
      order: { createdAt: 'DESC' },
    });
    return latest?.rate ?? '0';
  }

  private async computeVolatility(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rates = await this.rateRepo.find({
      where: {
        currencyPair: 'XLM/NGN',
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
      order: { createdAt: 'ASC' },
    });

    if (rates.length < 2) {
      return 0.5;
    }

    const logReturns: number[] = [];
    for (let i = 1; i < rates.length; i++) {
      const prev = Number(rates[i - 1].rate);
      const curr = Number(rates[i].rate);
      if (prev > 0 && curr > 0) {
        logReturns.push(Math.log(curr / prev));
      }
    }

    if (logReturns.length === 0) {
      return 0.5;
    }

    const mean =
      logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance =
      logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
      (logReturns.length - 1);

    return Math.sqrt(variance);
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);

    const t = 1 / (1 + p * absX);
    const y =
      1 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-absX * absX / 2);

    return 0.5 * (1 + sign * y);
  }
}
