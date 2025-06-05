import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from '../currencies/entities/currency.entity';
import {
  SimulateConversionDto,
  ConversionSimulationResponse,
} from '../currencies/dto/simulate-conversion.dto';
import { WalletService } from '../wallet/wallet.service';

interface RateLock {
  rate: number;
  timestamp: Date;
  expiresAt: Date;
}

@Injectable()
export class ConversionsService {
  private rateLocks: Map<string, RateLock> = new Map();
  private readonly RATE_LOCK_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly walletService: WalletService, // Add wallet service
  ) {}

  private generateRateLockKey(
    fromCurrency: string,
    toCurrency: string,
  ): string {
    return `${fromCurrency}-${toCurrency}`;
  }

  private getLockedRate(
    fromCurrency: string,
    toCurrency: string,
  ): number | null {
    const key = this.generateRateLockKey(fromCurrency, toCurrency);
    const lock = this.rateLocks.get(key);

    if (!lock) return null;

    // Check if the lock has expired
    if (new Date() > lock.expiresAt) {
      this.rateLocks.delete(key);
      return null;
    }

    return lock.rate;
  }

  private setRateLock(
    fromCurrency: string,
    toCurrency: string,
    rate: number,
  ): void {
    const key = this.generateRateLockKey(fromCurrency, toCurrency);
    const now = new Date();

    this.rateLocks.set(key, {
      rate,
      timestamp: now,
      expiresAt: new Date(now.getTime() + this.RATE_LOCK_DURATION),
    });
  }

  private calculateFees(
    amount: number,
    currencyType: string,
  ): { amount: number; percentage: number } {
    // Fee structure based on currency type and amount
    let feePercentage: number;

    // Different fee tiers based on amount
    if (amount >= 10000) {
      feePercentage = 0.001; // 0.1% for large amounts
    } else if (amount >= 1000) {
      feePercentage = 0.002; // 0.2% for medium amounts
    } else {
      feePercentage = 0.005; // 0.5% for small amounts
    }

    // Additional fee adjustments based on currency type
    if (currencyType === 'CRYPTO') {
      feePercentage += 0.001; // Additional 0.1% for crypto
    }

    const feeAmount = amount * feePercentage;

    return {
      amount: feeAmount,
      percentage: feePercentage * 100,
    };
  }

  async simulateConversion(
    simulateConversionDto: SimulateConversionDto,
    userId?: string, // Add optional userId for wallet creation
  ): Promise<ConversionSimulationResponse> {
    const { fromCurrency, toCurrency, amount } = simulateConversionDto;

    // Auto-create wallets if userId is provided
    if (userId) {
      await Promise.all([
        this.walletService.getOrCreateWalletForConversion(userId, fromCurrency),
        this.walletService.getOrCreateWalletForConversion(userId, toCurrency),
      ]);
    }

    // Get both currencies
    const [sourceCurrency, targetCurrency] = await Promise.all([
      this.currencyRepository.findOne({ where: { code: fromCurrency } }),
      this.currencyRepository.findOne({ where: { code: toCurrency } }),
    ]);

    if (!sourceCurrency || !targetCurrency) {
      throw new BadRequestException('One or both currencies not found');
    }

    if (!sourceCurrency.rate || !targetCurrency.rate) {
      throw new BadRequestException(
        'Exchange rates not available for one or both currencies',
      );
    }

    // Check for existing rate lock
    let exchangeRate = this.getLockedRate(fromCurrency, toCurrency);

    // If no valid rate lock exists, calculate new rate and create lock
    if (!exchangeRate) {
      exchangeRate = targetCurrency.rate / sourceCurrency.rate;
      this.setRateLock(fromCurrency, toCurrency, exchangeRate);
    }

    // Calculate base conversion amount
    const baseAmount = amount * exchangeRate;

    // Calculate fees based on currency type and amount
    const fees = this.calculateFees(baseAmount, targetCurrency.type);

    // Calculate final amount after fees
    const finalAmount = baseAmount - fees.amount;

    return {
      fromCurrency: sourceCurrency.code,
      toCurrency: targetCurrency.code,
      inputAmount: amount,
      outputAmount: finalAmount,
      exchangeRate,
      fees,
      timestamp: new Date(),
      rateLockExpiresAt: this.rateLocks.get(
        this.generateRateLockKey(fromCurrency, toCurrency),
      )?.expiresAt,
    };
  }

  // async convertWithRateLock(
  //   userId: string,
  //   pair: string,
  //   amount: number,
  //   lockedRate: number,
  // ): Promise<number> {
  //   const isValid = await this.rateLocksService.validateRateLock(
  //     userId,
  //     pair,
  //     lockedRate,
  //   );

  //   if (!isValid) {
  //     throw new BadRequestException('Invalid or expired rate lock.');
  //   }

  //   return amount * lockedRate;
  // }
}
