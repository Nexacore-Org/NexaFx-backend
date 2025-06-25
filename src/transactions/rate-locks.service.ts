import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { RateLock } from './entities/ratelock.entity';
import { Currency } from 'src/currencies/entities/currency.entity';

@Injectable()
export class RateLocksService {
  constructor(
    @InjectRepository(RateLock)
    private readonly rateLockRepository: Repository<RateLock>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
  ) {}

  private static LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  // create rate-lock
  async lockRate(userId: string, pair: string): Promise<RateLock> {
    const now = new Date();
    const existingLock = await this.rateLockRepository.findOne({
      where: {
        userId,
        pair,
        expiresAt: MoreThan(now),
      },
    });

    if (existingLock) {
      throw new ConflictException(
        'Active rate lock already exists for this user and currency pair.',
      );
    }

    const rate = await this.getRateForPair(pair);
    const expiresAt = new Date(Date.now() + RateLocksService.LOCK_DURATION_MS);

    const lock = this.rateLockRepository.create({
      userId,
      pair,
      lockedRate: rate,
      expiresAt,
    });

    return this.rateLockRepository.save(lock);
  }

  // validate rate
  async getValidRateLock(
    userId: string,
    pair: string,
  ): Promise<RateLock | null> {
    const now = new Date();

    return await this.rateLockRepository.findOne({
      where: {
        userId,
        pair,
        expiresAt: MoreThan(now),
      },
      order: { expiresAt: 'DESC' },
    });
  }

  // async isExpired(id: string): Promise<boolean> {
  //   const rateLock = await this.findById(id);
  //   if (!rateLock) return true;
  //   return new Date(rateLock.expiresAt) < new Date();
  // }

  async findById(id: string): Promise<RateLock | null> {
    return this.rateLockRepository.findOne({ where: { id } });
  }

  // cleanup expired locks
  async cleanupExpiredLocks(beforeDate: Date): Promise<number> {
    const result = await this.rateLockRepository.delete({
      expiresAt: LessThan(beforeDate),
    });
    return result.affected || 0;
  }

  async getRateForPair(pair: string): Promise<number> {
    const [fromCode, toCode] = pair.split('/');

    if (!fromCode || !toCode) {
      throw new Error(`Invalid pair format: expected 'FROM/TO', got '${pair}'`);
    }

    const [fromCurrency, toCurrency] = await Promise.all([
      this.currencyRepository.findOne({ where: { code: fromCode } }),
      this.currencyRepository.findOne({ where: { code: toCode } }),
    ]);

    if (!fromCurrency || !toCurrency) {
      throw new NotFoundException(
        `Could not find currencies for pair: ${pair}`,
      );
    }

    if (!fromCurrency.rate || !toCurrency.rate) {
      throw new Error(`Missing rate data for: ${pair}`);
    }

    // Rate: how much of TO you get for 1 unit of FROM
    const rate = toCurrency.rate / fromCurrency.rate;

    return rate;
  }
}
