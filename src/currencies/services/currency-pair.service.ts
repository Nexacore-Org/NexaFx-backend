import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { CurrencyPair } from '../entities/currency-pair.entity';
import {
  CreateCurrencyPairDto,
  SuspendPairDto,
  UpdateCurrencyPairDto,
} from '../dto/currency-pair.dto';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

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

  async create(data: CreateCurrencyPairDto): Promise<CurrencyPair> {
    this.assertPairPayload(data);

    const pair = this.currencyPairRepository.create({
      ...data,
      fromCurrencyCode: data.fromCurrencyCode.toUpperCase(),
      toCurrencyCode: data.toCurrencyCode.toUpperCase(),
    });
    return this.currencyPairRepository.save(pair);
  }

  async update(id: string, data: UpdateCurrencyPairDto): Promise<CurrencyPair> {
    this.assertPairPayload(data);

    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    Object.assign(pair, {
      ...data,
      ...(data.fromCurrencyCode
        ? { fromCurrencyCode: data.fromCurrencyCode.toUpperCase() }
        : {}),
      ...(data.toCurrencyCode
        ? { toCurrencyCode: data.toCurrencyCode.toUpperCase() }
        : {}),
    });
    return this.currencyPairRepository.save(pair);
  }

  async suspend(id: string, data: SuspendPairDto): Promise<CurrencyPair> {
    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    const durationMs = this.parseDuration(data.duration);
    const suspendedUntil = new Date(Date.now() + durationMs);

    pair.isActive = false;
    pair.suspendedUntil = suspendedUntil;
    pair.suspensionReason = data.reason;

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
          suspensionStatus: pair.suspendedUntil
            ? `Suspended until ${pair.suspendedUntil.toISOString()}`
            : 'Active',
          spread: `${pair.spreadPercent}%`,
          lastRateFetchTime: new Date(), // Mock
          '24hVolume': 0, // Mock
        };
      }),
    );
  }

  async validatePair(
    fromCode: string,
    toCode: string,
    amountUsd?: number,
  ): Promise<CurrencyPair> {
    const pair = await this.findByCodes(fromCode, toCode);

    if (!pair) {
      throw new BadRequestException(
        `Trading pair ${fromCode}/${toCode} is not supported`,
      );
    }

    if (!pair.isActive) {
      const reason =
        pair.suspensionReason ||
        'Trading is temporarily suspended for this pair';
      throw new BadRequestException(
        `Pair ${fromCode}/${toCode} is suspended: ${reason}`,
      );
    }

    if (amountUsd !== undefined) {
      if (pair.minAmountUsd && amountUsd < pair.minAmountUsd) {
        throw new BadRequestException(
          `Amount is below the minimum limit of ${pair.minAmountUsd} USD`,
        );
      }
      if (pair.maxAmountUsd && amountUsd > pair.maxAmountUsd) {
        throw new BadRequestException(
          `Amount exceeds the maximum limit of ${pair.maxAmountUsd} USD`,
        );
      }
    }

    return pair;
  }

  private assertPairPayload(data: Partial<CurrencyPair>): void {
    const forbidden = ['id', 'createdAt', 'updatedAt', 'deletedAt'];
    const presentForbidden = forbidden.filter(
      (key) => (data as Record<string, unknown>)[key] !== undefined,
    );
    if (presentForbidden.length > 0) {
      throw new BadRequestException(
        `Cannot set read-only fields: ${presentForbidden.join(', ')}`,
      );
    }

    for (const key of ['fromCurrencyCode', 'toCurrencyCode'] as const) {
      const code = data[key];
      if (code !== undefined && !CURRENCY_CODE_PATTERN.test(code)) {
        throw new BadRequestException(`${key} must be a 2-10 character code`);
      }
    }

    const { spreadPercent, minAmountUsd, maxAmountUsd } = data;
    if (
      spreadPercent !== undefined &&
      (spreadPercent < 0 || spreadPercent > 100)
    ) {
      throw new BadRequestException('spreadPercent must be between 0 and 100');
    }
    if (
      minAmountUsd !== undefined &&
      maxAmountUsd !== undefined &&
      minAmountUsd > maxAmountUsd
    ) {
      throw new BadRequestException(
        'minAmountUsd must be less than or equal to maxAmountUsd',
      );
    }
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
