import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FeeConfig,
  FeeTransactionType,
  FeeType,
} from './entities/fee-config.entity';
import { FeeRecord } from './entities/fee-record.entity';
import { CreateFeeConfigDto } from './dtos/create-fee-config.dto';
import { UpdateFeeConfigDto } from './dtos/update-fee-config.dto';

export interface CalculatedFee {
  feeAmount: number;
  feeCurrency: string;
  feeType: FeeType;
}

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    @InjectRepository(FeeConfig)
    private readonly feeConfigRepository: Repository<FeeConfig>,
    @InjectRepository(FeeRecord)
    private readonly feeRecordRepository: Repository<FeeRecord>,
  ) {}

  /**
   * Calculate the fee for a given transaction type, currency, and amount.
   * Uses the active fee configuration that matches the transaction type and currency.
   * Falls back to a wildcard currency config ('*') if no exact match is found.
   */
  async calculateFee(
    transactionType: FeeTransactionType,
    currency: string,
    amount: number,
  ): Promise<CalculatedFee> {
    const config = await this.findActiveConfig(transactionType, currency);

    if (!config) {
      return { feeAmount: 0, feeCurrency: currency, feeType: FeeType.FLAT };
    }

    let feeAmount: number;

    if (config.feeType === FeeType.FLAT) {
      feeAmount = parseFloat(config.feeValue);
    } else {
      const percentage = parseFloat(config.feeValue);
      feeAmount = (percentage / 100) * amount;

      const minFee = config.minFee ? parseFloat(config.minFee) : null;
      const maxFee = config.maxFee ? parseFloat(config.maxFee) : null;

      if (minFee !== null && feeAmount < minFee) {
        feeAmount = minFee;
      }
      if (maxFee !== null && feeAmount > maxFee) {
        feeAmount = maxFee;
      }
    }

    // Round to 8 decimal places to match the precision used in the DB
    feeAmount = parseFloat(feeAmount.toFixed(8));

    return {
      feeAmount,
      feeCurrency: currency,
      feeType: config.feeType,
    };
  }

  /**
   * Persist a fee record for a completed transaction.
   */
  async recordFee(
    transactionId: string,
    userId: string,
    fee: CalculatedFee,
  ): Promise<FeeRecord> {
    const record = this.feeRecordRepository.create({
      transactionId,
      userId,
      feeAmount: fee.feeAmount.toFixed(8),
      feeCurrency: fee.feeCurrency,
      feeType: fee.feeType,
    });

    return this.feeRecordRepository.save(record);
  }

  /**
   * Retrieve the fee record associated with a specific transaction.
   */
  async getFeeRecordByTransactionId(
    transactionId: string,
  ): Promise<FeeRecord | null> {
    return this.feeRecordRepository.findOne({ where: { transactionId } });
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  /**
   * List all fee configurations, ordered by transaction type and currency.
   */
  async getFeeConfigs(): Promise<FeeConfig[]> {
    return this.feeConfigRepository.find({
      order: { transactionType: 'ASC', currency: 'ASC' },
    });
  }

  /**
   * Create a new fee configuration rule.
   */
  async createFeeConfig(dto: CreateFeeConfigDto): Promise<FeeConfig> {
    if (dto.feeType === FeeType.FLAT && (dto.minFee || dto.maxFee)) {
      throw new BadRequestException(
        'minFee and maxFee are only applicable for percentage-based fees',
      );
    }

    if (dto.minFee && dto.maxFee && dto.minFee > dto.maxFee) {
      throw new BadRequestException('minFee cannot be greater than maxFee');
    }

    const existing = await this.feeConfigRepository.findOne({
      where: {
        transactionType: dto.transactionType,
        currency: dto.currency.toUpperCase(),
        isActive: true,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `An active fee config already exists for ${dto.transactionType} / ${dto.currency}. ` +
          'Deactivate or update the existing rule first.',
      );
    }

    const partial: Partial<FeeConfig> = {
      transactionType: dto.transactionType,
      currency: dto.currency.toUpperCase(),
      feeType: dto.feeType,
      feeValue: dto.feeValue.toString(),
      minFee: dto.minFee?.toString() ?? null,
      maxFee: dto.maxFee?.toString() ?? null,
    };

    const config = this.feeConfigRepository.create(partial);
    const saved = await this.feeConfigRepository.save(config);

    this.logger.log(
      `Fee config created: ${config.transactionType} / ${config.currency} — ` +
        `${config.feeType} ${config.feeValue}`,
    );

    return saved;
  }

  /**
   * Update an existing fee configuration rule.
   */
  async updateFeeConfig(
    id: string,
    dto: UpdateFeeConfigDto,
  ): Promise<FeeConfig> {
    const config = await this.feeConfigRepository.findOne({ where: { id } });

    if (!config) {
      throw new NotFoundException(`Fee config with ID '${id}' not found`);
    }

    const resolvedFeeType = dto.feeType ?? config.feeType;

    if (resolvedFeeType === FeeType.FLAT) {
      const hasMinFee = dto.minFee !== undefined ? dto.minFee : config.minFee;
      const hasMaxFee = dto.maxFee !== undefined ? dto.maxFee : config.maxFee;
      if (hasMinFee || hasMaxFee) {
        throw new BadRequestException(
          'minFee and maxFee are only applicable for percentage-based fees',
        );
      }
    }

    if (dto.transactionType !== undefined) {
      config.transactionType = dto.transactionType;
    }
    if (dto.currency !== undefined) {
      config.currency = dto.currency.toUpperCase();
    }
    if (dto.feeType !== undefined) {
      config.feeType = dto.feeType;
    }
    if (dto.feeValue !== undefined) {
      config.feeValue = dto.feeValue.toString();
    }
    if (dto.minFee !== undefined) {
      config.minFee = dto.minFee.toString();
    }
    if (dto.maxFee !== undefined) {
      config.maxFee = dto.maxFee.toString();
    }
    if (dto.isActive !== undefined) {
      config.isActive = dto.isActive;
    }

    const saved = await this.feeConfigRepository.save(config);

    this.logger.log(`Fee config updated: ${saved.id}`);

    return saved;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Find the active fee config for a given transaction type and currency.
   * Falls back to a wildcard ('*') currency config if no exact match exists.
   */
  private async findActiveConfig(
    transactionType: FeeTransactionType,
    currency: string,
  ): Promise<FeeConfig | null> {
    const exactMatch = await this.feeConfigRepository.findOne({
      where: {
        transactionType,
        currency: currency.toUpperCase(),
        isActive: true,
      },
    });

    if (exactMatch) {
      return exactMatch;
    }

    // Fallback: wildcard currency config
    return this.feeConfigRepository.findOne({
      where: {
        transactionType,
        currency: '*',
        isActive: true,
      },
    });
  }
}
