import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmlConfig } from './entities/aml-config.entity';
import { UpdateAmlConfigDto } from './dto/update-aml-config.dto';

@Injectable()
export class ComplianceConfigService {
  private readonly logger = new Logger(ComplianceConfigService.name);
  private cachedConfig: AmlConfig | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(AmlConfig)
    private readonly configRepo: Repository<AmlConfig>,
  ) {}

  async getConfig(): Promise<AmlConfig> {
    if (
      this.cachedConfig &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.cachedConfig;
    }
    let config = await this.configRepo.findOne({ where: {} });
    if (!config) {
      config = this.configRepo.create();
      config = await this.configRepo.save(config);
    }
    this.cachedConfig = config;
    this.cacheTimestamp = Date.now();
    return config;
  }

  async updateConfig(dto: UpdateAmlConfigDto): Promise<AmlConfig> {
    let config = await this.configRepo.findOne({ where: {} });
    if (!config) {
      config = this.configRepo.create();
    }
    if (dto.largeTxThresholdUsd !== undefined)
      config.largeTxThresholdUsd = dto.largeTxThresholdUsd;
    if (dto.rapidMovementCount !== undefined)
      config.rapidMovementCount = dto.rapidMovementCount;
    if (dto.rapidMovementWindowMinutes !== undefined)
      config.rapidMovementWindowMinutes = dto.rapidMovementWindowMinutes;
    if (dto.roundTripWindowMinutes !== undefined)
      config.roundTripWindowMinutes = dto.roundTripWindowMinutes;
    if (dto.structuringCount !== undefined)
      config.structuringCount = dto.structuringCount;
    if (dto.structuringWindowHours !== undefined)
      config.structuringWindowHours = dto.structuringWindowHours;
    if (dto.newAccountLargeTxThresholdUsd !== undefined)
      config.newAccountLargeTxThresholdUsd = dto.newAccountLargeTxThresholdUsd;
    if (dto.newAccountAgeDays !== undefined)
      config.newAccountAgeDays = dto.newAccountAgeDays;

    config = await this.configRepo.save(config);
    this.cachedConfig = config;
    this.cacheTimestamp = Date.now();
    return config;
  }
}
