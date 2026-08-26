import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionType,
} from '../entities/transaction.entity';
import { FeesService, CalculatedFee } from '../../fees/fees.service';
import { FeeTransactionType } from '../../fees/entities/fee-config.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { StellarService } from '../../modules/stellar/stellar.service';
import { RedisService } from '../../modules/redis/redis.service';
import Decimal from 'decimal.js';

export interface FeeBreakdown {
  amount: string;
  currency: string;
  percent?: string;
}

export interface FeeEstimateResult {
  fromAmount: string;
  fromCurrency: string;
  toAmount: string;
  toCurrency: string;
  recipient: {
    receives: string;
    currency: string;
  };
  fees: {
    platformFee: FeeBreakdown;
    networkFee: FeeBreakdown;
    markupFee: FeeBreakdown;
    total: FeeBreakdown;
  };
  exchangeRate: number | null;
  totalDeducted: string;
  validForSeconds: number;
}

export interface ConversionEstimateResult {
  fromAmount: string;
  fromCurrency: string;
  toAmount: string;
  toCurrency: string;
  fees: {
    conversionFee: FeeBreakdown;
    platformFee: FeeBreakdown;
    total: FeeBreakdown;
  };
  exchangeRate: number;
  totalDeducted: string;
  validForSeconds: number;
}

export interface BatchEstimateResult {
  estimates: FeeEstimateResult[];
  totalFees: string;
  feeCurrency: string;
}

const ESTIMATE_TTL_SECONDS = 30;
const MARKUP_PERCENT = 0.35;
const STELLAR_NETWORK_FEE = '0.00001';

@Injectable()
export class FeeEstimatorService {
  private readonly logger = new Logger(FeeEstimatorService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly feesService: FeesService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly stellarService: StellarService,
    private readonly redisService: RedisService,
  ) {}

  async estimateTransaction(
    userId: string,
    params: {
      type: TransactionType;
      amount: number;
      currency: string;
      toCurrency?: string;
    },
  ): Promise<FeeEstimateResult> {
    const fromCurrency = params.currency.toUpperCase();
    const toCurrency = (params.toCurrency ?? params.currency).toUpperCase();

    const platformFee = await this.feesService.calculateFee(
      this.mapTransactionType(params.type),
      fromCurrency,
      params.amount,
    );

    const networkFeeDecimal = new Decimal(STELLAR_NETWORK_FEE);

    const markupAmount = new Decimal(params.amount)
      .times(MARKUP_PERCENT)
      .div(100)
      .toDecimalPlaces(8);

    const totalFees = new Decimal(platformFee.feeAmount)
      .plus(networkFeeDecimal)
      .plus(markupAmount);

    const toAmount = new Decimal(params.amount).minus(totalFees);

    if (toAmount.isNegative()) {
      throw new BadRequestException(
        'Insufficient amount: total fees exceed the transaction amount',
      );
    }

    const result: FeeEstimateResult = {
      fromAmount: params.amount.toFixed(8),
      fromCurrency,
      toAmount: toAmount.toFixed(8),
      toCurrency,
      recipient: {
        receives: toAmount.toFixed(8),
        currency: toCurrency,
      },
      fees: {
        platformFee: {
          amount: platformFee.feeAmount.toFixed(8),
          currency: fromCurrency,
          percent: platformFee.feeType === 'PERCENTAGE'
            ? this.getFeePercentage(platformFee)
            : undefined,
        },
        networkFee: {
          amount: networkFeeDecimal.toFixed(8),
          currency: fromCurrency,
        },
        markupFee: {
          amount: markupAmount.toFixed(8),
          currency: fromCurrency,
          percent: MARKUP_PERCENT.toString(),
        },
        total: {
          amount: totalFees.toFixed(8),
          currency: fromCurrency,
        },
      },
      exchangeRate: null,
      totalDeducted: params.amount.toFixed(8),
      validForSeconds: ESTIMATE_TTL_SECONDS,
    };

    const cacheKey = this.redisService.key(
      'estimate',
      `${userId}:${this.hashParams(params)}`,
    );
    await this.redisService.setJson(cacheKey, result, ESTIMATE_TTL_SECONDS);

    return result;
  }

  async estimateConversion(
    userId: string,
    params: {
      fromCurrency: string;
      toCurrency: string;
      fromAmount: number;
    },
  ): Promise<ConversionEstimateResult> {
    const fromCurrency = params.fromCurrency.toUpperCase();
    const toCurrency = params.toCurrency.toUpperCase();

    const rateResponse = await this.exchangeRatesService.getRate(
      fromCurrency,
      toCurrency,
    );
    const baseRate = rateResponse.rate;

    const markupRate = new Decimal(baseRate)
      .times(new Decimal(1).plus(new Decimal(MARKUP_PERCENT).div(100)))
      .toDecimalPlaces(8)
      .toNumber();

    const grossToAmount = new Decimal(params.fromAmount).times(markupRate);

    const conversionFeePercent = parseFloat(
      process.env.CONVERSION_FEE_PERCENT ?? '0.5',
    );
    const conversionFee = grossToAmount
      .times(conversionFeePercent)
      .div(100)
      .toDecimalPlaces(8);

    const platformFeePercent = new Decimal(conversionFeePercent);
    const platformFeeAmount = grossToAmount
      .times(platformFeePercent)
      .div(100)
      .toDecimalPlaces(8);

    const totalFees = conversionFee.plus(platformFeeAmount);
    const netToAmount = grossToAmount.minus(totalFees);

    const result: ConversionEstimateResult = {
      fromAmount: params.fromAmount.toFixed(8),
      fromCurrency,
      toAmount: netToAmount.toFixed(8),
      toCurrency,
      fees: {
        conversionFee: {
          amount: conversionFee.toFixed(8),
          currency: toCurrency,
          percent: conversionFeePercent.toString(),
        },
        platformFee: {
          amount: platformFeeAmount.toFixed(8),
          currency: toCurrency,
          percent: platformFeePercent.toFixed(1),
        },
        total: {
          amount: totalFees.toFixed(8),
          currency: toCurrency,
        },
      },
      exchangeRate: markupRate,
      totalDeducted: params.fromAmount.toFixed(8),
      validForSeconds: ESTIMATE_TTL_SECONDS,
    };

    const cacheKey = this.redisService.key(
      'estimate',
      `conversion:${userId}:${this.hashParams(params)}`,
    );
    await this.redisService.setJson(cacheKey, result, ESTIMATE_TTL_SECONDS);

    return result;
  }

  async estimateBatch(
    userId: string,
    transactions: Array<{
      type: TransactionType;
      amount: number;
      currency: string;
      toCurrency?: string;
    }>,
  ): Promise<BatchEstimateResult> {
    if (transactions.length > 20) {
      throw new BadRequestException('Batch estimate is limited to 20 transactions');
    }

    const estimates = await Promise.all(
      transactions.map((tx) =>
        this.estimateTransaction(userId, tx),
      ),
    );

    const totalFees = estimates.reduce(
      (sum, e) => sum.plus(e.fees.total.amount),
      new Decimal(0),
    );

    return {
      estimates,
      totalFees: totalFees.toFixed(8),
      feeCurrency: estimates[0]?.fromCurrency ?? 'XLM',
    };
  }

  async checkEstimateDrift(
    userId: string,
    params: Record<string, unknown>,
  ): Promise<{ drifted: boolean; currentEstimate: FeeEstimateResult | null }> {
    const cacheKey = this.redisService.key(
      'estimate',
      `${userId}:${this.hashParams(params)}`,
    );
    const cached =
      await this.redisService.getJson<FeeEstimateResult>(cacheKey);

    if (!cached) {
      return { drifted: false, currentEstimate: null };
    }

    const currentEstimate = await this.estimateTransaction(userId, {
      type: params.type as TransactionType,
      amount: params.amount as number,
      currency: params.currency as string,
      toCurrency: params.toCurrency as string | undefined,
    });

    const oldTotal = new Decimal(cached.fees.total.amount);
    const newTotal = new Decimal(currentEstimate.fees.total.amount);

    if (oldTotal.isZero()) {
      return { drifted: false, currentEstimate };
    }

    const driftPercent = newTotal.minus(oldTotal).abs().div(oldTotal).times(100);

    return {
      drifted: driftPercent.greaterThan(2),
      currentEstimate,
    };
  }

  private mapTransactionType(type: TransactionType): FeeTransactionType {
    const mapping: Record<TransactionType, FeeTransactionType> = {
      [TransactionType.DEPOSIT]: FeeTransactionType.DEPOSIT,
      [TransactionType.WITHDRAW]: FeeTransactionType.WITHDRAW,
      [TransactionType.SWAP]: FeeTransactionType.SWAP,
      [TransactionType.LOAN_DISBURSEMENT]: FeeTransactionType.DEPOSIT,
      [TransactionType.LOAN_REPAYMENT]: FeeTransactionType.DEPOSIT,
    };
    return mapping[type] ?? FeeTransactionType.DEPOSIT;
  }

  private getFeePercentage(fee: CalculatedFee): string {
    return fee.feeType === 'PERCENTAGE' ? '0.5' : '0';
  }

  private hashParams(params: Record<string, unknown>): string {
    const str = JSON.stringify(params, Object.keys(params).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
