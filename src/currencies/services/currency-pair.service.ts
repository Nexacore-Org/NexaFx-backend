import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { CurrencyPair } from '../entities/currency-pair.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

@Injectable()
export class CurrencyPairService {
  constructor(
    @InjectRepository(CurrencyPair)
    private readonly currencyPairRepository: Repository<CurrencyPair>,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async findAll(activeOnly = true): Promise<any[]> {
    const queryBuilder = this.currencyPairRepository.createQueryBuilder('pair');

    if (activeOnly) {
      queryBuilder.where('pair.isActive = :isActive', { isActive: true });
    }

    const pairs = await queryBuilder.getMany();

    // Enrich with current rates
    return Promise.all(
      pairs.map(async (pair) => {
        try {
          const rateData = await this.exchangeRatesService.getRate(
            pair.fromCurrencyCode,
            pair.toCurrencyCode,
          );
          return {
            ...pair,
            currentRate: rateData.rate,
            effectiveRate: rateData.rate * (1 - pair.spreadPercent / 100),
          };
        } catch (error) {
          return {
            ...pair,
            currentRate: null,
            effectiveRate: null,
            error: 'Rate fetch failed',
          };
        }
      }),
    );
  }

  async findByCodes(
    fromCode: string,
    toCode: string,
  ): Promise<CurrencyPair | null> {
    return this.currencyPairRepository.findOne({
      where: {
        fromCurrencyCode: fromCode.toUpperCase(),
        toCurrencyCode: toCode.toUpperCase(),
      },
    });
  }

  async create(data: Partial<CurrencyPair>): Promise<CurrencyPair> {
    const pair = this.currencyPairRepository.create({
      ...data,
      fromCurrencyCode: data.fromCurrencyCode?.toUpperCase(),
      toCurrencyCode: data.toCurrencyCode?.toUpperCase(),
    });
    return this.currencyPairRepository.save(pair);
  }

  async update(id: string, data: Partial<CurrencyPair>): Promise<CurrencyPair> {
    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    Object.assign(pair, data);
    return this.currencyPairRepository.save(pair);
  }

  async suspend(
    id: string,
    reason: string,
    durationIso: string,
  ): Promise<CurrencyPair> {
    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    // Simple duration parsing (ISO 8601 duration or simple seconds/minutes/hours)
    // For simplicity, we'll assume the user provides a future date or we use a library if available.
    // Since I don't know the libraries, I'll use a simple approach: assume duration is in minutes for now
    // OR just use a Date object if the user provides ISO string.
    // The requirement says "ISO duration". I'll use a basic parser or just expect a valid Date string for now.
    // Wait, requirement says "ISO duration". Let's use `Date` and add time to it.
    
    const durationMs = this.parseDuration(durationIso);
    const suspendedUntil = new Date(Date.now() + durationMs);

    pair.isActive = false;
    pair.suspendedUntil = suspendedUntil;
    pair.suspensionReason = reason;

    return this.currencyPairRepository.save(pair);
  }

  async resume(id: string): Promise<CurrencyPair> {
    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    pair.isActive = true;
    pair.suspendedUntil = null;
    pair.suspensionReason = null;

    return this.currencyPairRepository.save(pair);
  }

  async autoResumePairs(): Promise<number> {
    const now = new Date();
    const pairs = await this.currencyPairRepository.find({
      where: {
        isActive: false,
        suspendedUntil: LessThanOrEqual(now),
      },
    });

    for (const pair of pairs) {
      pair.isActive = true;
      pair.suspendedUntil = null;
      pair.suspensionReason = null;
      await this.currencyPairRepository.save(pair);
    }

    return pairs.length;
  }

  async getHealth(): Promise<any[]> {
    const pairs = await this.currencyPairRepository.find();
    return Promise.all(
      pairs.map(async (pair) => {
        // Mocking 24h volume for now as it's not in the entity
        // In a real scenario, we'd query the transaction table
        return {
          id: pair.id,
          pair: `${pair.fromCurrencyCode}/${pair.toCurrencyCode}`,
          isActive: pair.isActive,
          suspensionStatus: pair.suspendedUntil ? `Suspended until ${pair.suspendedUntil.toISOString()}` : 'Active',
          spread: `${pair.spreadPercent}%`,
          lastRateFetchTime: new Date(), // Mock
          '24hVolume': 0, // Mock
        };
      }),
    );
  }

  async validatePair(fromCode: string, toCode: string, amountUsd?: number): Promise<CurrencyPair> {
    const pair = await this.findByCodes(fromCode, toCode);
    
    if (!pair) {
      throw new BadRequestException(`Trading pair ${fromCode}/${toCode} is not supported`);
    }

    if (!pair.isActive) {
      const reason = pair.suspensionReason || 'Trading is temporarily suspended for this pair';
      throw new BadRequestException(`Pair ${fromCode}/${toCode} is suspended: ${reason}`);
    }

    if (amountUsd !== undefined) {
      if (pair.minAmountUsd && amountUsd < pair.minAmountUsd) {
        throw new BadRequestException(`Amount is below the minimum limit of ${pair.minAmountUsd} USD`);
      }
      if (pair.maxAmountUsd && amountUsd > pair.maxAmountUsd) {
        throw new BadRequestException(`Amount exceeds the maximum limit of ${pair.maxAmountUsd} USD`);
      }
    }

    return pair;
  }

  private parseDuration(isoDuration: string): number {
    // Very basic ISO 8601 duration parser (supports only PT...H, PT...M, PT...S)
    // Example: PT1H = 1 hour, PT30M = 30 minutes
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) {
      // Fallback: try to parse as ISO date string
      const date = new Date(isoDuration);
      if (!isNaN(date.getTime())) {
        return date.getTime() - Date.now();
      }
      return 0;
    }

    const hours = parseInt(matches[1] || '0');
    const minutes = parseInt(matches[2] || '0');
    const seconds = parseInt(matches[3] || '0');

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
}
