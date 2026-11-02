import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { CurrencyPair } from '../entities/currency-pair.entity';
import {
  CURRENCY_CODE_REGEX,
  CreateCurrencyPairDto,
  UpdateCurrencyPairDto,
} from '../dto/currency-pair.dto';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';

const ALLOWED_PAIR_FIELDS = new Set([
  'fromCurrencyCode',
  'toCurrencyCode',
  'spreadPercent',
  'minAmountUsd',
  'maxAmountUsd',
  'isActive',
]);

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
        } catch {
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

  async create(
    data: CreateCurrencyPairDto | Partial<CurrencyPair>,
  ): Promise<CurrencyPair> {
    this.validateAllowedFields(data as Record<string, unknown>);

    if (!data?.fromCurrencyCode || !data?.toCurrencyCode) {
      throw new BadRequestException(
        'fromCurrencyCode and toCurrencyCode are required',
      );
    }

    const fromCurrencyCode = this.normalizeCurrencyCode(
      data.fromCurrencyCode,
      'fromCurrencyCode',
    );
    const toCurrencyCode = this.normalizeCurrencyCode(
      data.toCurrencyCode,
      'toCurrencyCode',
    );
    if (fromCurrencyCode === toCurrencyCode) {
      throw new BadRequestException(
        'fromCurrencyCode and toCurrencyCode must be different',
      );
    }

    const spreadPercent =
      data.spreadPercent !== undefined ? Number(data.spreadPercent) : 0;
    this.validateSpread(spreadPercent);

    const minAmountUsd =
      data.minAmountUsd !== undefined && data.minAmountUsd !== null
        ? Number(data.minAmountUsd)
        : undefined;
    const maxAmountUsd =
      data.maxAmountUsd !== undefined && data.maxAmountUsd !== null
        ? Number(data.maxAmountUsd)
        : undefined;
    this.validateBounds(minAmountUsd, maxAmountUsd);

    const pair = this.currencyPairRepository.create({
      fromCurrencyCode,
      toCurrencyCode,
      spreadPercent,
      ...(minAmountUsd !== undefined ? { minAmountUsd } : {}),
      ...(maxAmountUsd !== undefined ? { maxAmountUsd } : {}),
      ...(data.isActive !== undefined
        ? { isActive: Boolean(data.isActive) }
        : {}),
    });
    return this.currencyPairRepository.save(pair);
  }

  async update(
    id: string,
    data: UpdateCurrencyPairDto | Partial<CurrencyPair>,
  ): Promise<CurrencyPair> {
    this.validateAllowedFields(data as Record<string, unknown>);

    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    if (data.fromCurrencyCode !== undefined) {
      pair.fromCurrencyCode = this.normalizeCurrencyCode(
        data.fromCurrencyCode,
        'fromCurrencyCode',
      );
    }
    if (data.toCurrencyCode !== undefined) {
      pair.toCurrencyCode = this.normalizeCurrencyCode(
        data.toCurrencyCode,
        'toCurrencyCode',
      );
    }
    if (pair.fromCurrencyCode === pair.toCurrencyCode) {
      throw new BadRequestException(
        'fromCurrencyCode and toCurrencyCode must be different',
      );
    }

    if (data.spreadPercent !== undefined) {
      const spread = Number(data.spreadPercent);
      this.validateSpread(spread);
      pair.spreadPercent = spread;
    }

    const resolvedMin =
      data.minAmountUsd !== undefined
        ? data.minAmountUsd === null
          ? undefined
          : Number(data.minAmountUsd)
        : pair.minAmountUsd !== undefined && pair.minAmountUsd !== null
          ? Number(pair.minAmountUsd)
          : undefined;
    const resolvedMax =
      data.maxAmountUsd !== undefined
        ? data.maxAmountUsd === null
          ? undefined
          : Number(data.maxAmountUsd)
        : pair.maxAmountUsd !== undefined && pair.maxAmountUsd !== null
          ? Number(pair.maxAmountUsd)
          : undefined;

    this.validateBounds(resolvedMin, resolvedMax);

    if (data.minAmountUsd !== undefined) {
      pair.minAmountUsd = resolvedMin as number;
    }
    if (data.maxAmountUsd !== undefined) {
      pair.maxAmountUsd = resolvedMax as number;
    }
    if (data.isActive !== undefined) {
      pair.isActive = Boolean(data.isActive);
    }

    return this.currencyPairRepository.save(pair);
  }

  async suspend(
    id: string,
    reason: string,
    durationIso: string,
  ): Promise<CurrencyPair> {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new BadRequestException('Suspension reason is required');
    }
    if (
      !durationIso ||
      typeof durationIso !== 'string' ||
      !durationIso.trim()
    ) {
      throw new BadRequestException('Suspension duration is required');
    }

    const pair = await this.currencyPairRepository.findOne({ where: { id } });
    if (!pair) throw new NotFoundException('Currency pair not found');

    const durationMs = this.parseDuration(durationIso);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new BadRequestException('Invalid suspension duration');
    }
    const suspendedUntil = new Date(Date.now() + durationMs);

    pair.isActive = false;
    pair.suspendedUntil = suspendedUntil;
    pair.suspensionReason = reason.trim();

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
        return {
          id: pair.id,
          pair: `${pair.fromCurrencyCode}/${pair.toCurrencyCode}`,
          isActive: pair.isActive,
          suspensionStatus: pair.suspendedUntil
            ? `Suspended until ${pair.suspendedUntil.toISOString()}`
            : 'Active',
          spread: `${pair.spreadPercent}%`,
          lastRateFetchTime: new Date(),
          '24hVolume': 0,
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

  private validateAllowedFields(data: Record<string, unknown>): void {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('Invalid currency pair payload');
    }
    for (const key of Object.keys(data)) {
      if (!ALLOWED_PAIR_FIELDS.has(key)) {
        throw new BadRequestException(`Property ${key} should not exist`);
      }
    }
  }

  private normalizeCurrencyCode(code: unknown, fieldName: string): string {
    if (typeof code !== 'string' || !CURRENCY_CODE_REGEX.test(code.trim())) {
      throw new BadRequestException(
        `${fieldName} must be 2 to 10 alphanumeric characters`,
      );
    }
    return code.trim().toUpperCase();
  }

  private validateSpread(spreadPercent: number): void {
    if (
      !Number.isFinite(spreadPercent) ||
      spreadPercent < 0 ||
      spreadPercent > 100
    ) {
      throw new BadRequestException(
        'spreadPercent must be a number between 0 and 100',
      );
    }
  }

  private validateBounds(minAmountUsd?: number, maxAmountUsd?: number): void {
    if (minAmountUsd !== undefined) {
      if (!Number.isFinite(minAmountUsd) || minAmountUsd < 0) {
        throw new BadRequestException(
          'minAmountUsd must be a non-negative number',
        );
      }
    }
    if (maxAmountUsd !== undefined) {
      if (!Number.isFinite(maxAmountUsd) || maxAmountUsd < 0) {
        throw new BadRequestException(
          'maxAmountUsd must be a non-negative number',
        );
      }
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
    const regex = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
    const matches = isoDuration.match(regex);
    if (!matches) {
      const date = new Date(isoDuration);
      if (!isNaN(date.getTime())) {
        return date.getTime() - Date.now();
      }
      return 0;
    }

    const hours = parseInt(matches[1] || '0', 10);
    const minutes = parseInt(matches[2] || '0', 10);
    const seconds = parseInt(matches[3] || '0', 10);

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
}
