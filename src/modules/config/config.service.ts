import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PlatformConfig } from './entities/platform-config.entity';
import { ConfigVersion } from './entities/config-version.entity';

const CACHE_TTL = 3600;
const CACHE_PREFIX = 'platform:config:';

const DEFAULT_CONFIGS = [
  {
    key: 'conversion.fee_percent',
    value: { type: 'number' as const, data: 0.005 },
    description: 'Percentage fee applied on currency conversions',
    category: 'conversion',
  },
  {
    key: 'kyc.basic_daily_limit_usd',
    value: { type: 'number' as const, data: 1000 },
    description: 'Daily transaction limit for basic KYC tier in USD',
    category: 'kyc',
  },
  {
    key: 'kyc.enhanced_required_above_usd',
    value: { type: 'number' as const, data: 5000 },
    description: 'Transaction amount above which enhanced KYC is required',
    category: 'kyc',
  },
  {
    key: 'security.max_login_attempts',
    value: { type: 'number' as const, data: 5 },
    description: 'Maximum failed login attempts before account lockout',
    category: 'security',
  },
  {
    key: 'limits.max_transfer_usd',
    value: { type: 'number' as const, data: 50000 },
    description: 'Maximum single transfer amount in USD',
    category: 'limits',
  },
];

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);

  constructor(
    @InjectRepository(PlatformConfig)
    private readonly configRepo: Repository<PlatformConfig>,
    @InjectRepository(ConfigVersion)
    private readonly versionRepo: Repository<ConfigVersion>,
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initDefaults();
  }

  async getConfig(key: string): Promise<PlatformConfig> {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const config = await this.configRepo.findOne({ where: { key } });

    if (!config) {
      throw new NotFoundException(`Config key '${key}' not found`);
    }

    await this.redis.set(cacheKey, JSON.stringify(config), 'EX', CACHE_TTL);
    return config;
  }

  async setConfig(
    key: string,
    newValue: { type: string; data: any },
    changedBy: string,
    reason?: string,
  ): Promise<PlatformConfig> {
    const config = await this.configRepo.findOne({ where: { key } });

    if (!config) {
      throw new NotFoundException(`Config key '${key}' not found`);
    }

    if (!config.isEditable) {
      throw new BadRequestException(`Config key '${key}' is not editable`);
    }

    const oldValue = { ...config.value };

    const version = this.versionRepo.create({
      configKey: key,
      oldValue,
      newValue,
      changedBy,
      changeReason: reason || null,
    });
    await this.versionRepo.save(version);

    config.value = newValue;
    await this.configRepo.save(config);

    const cacheKey = `${CACHE_PREFIX}${key}`;
    await this.redis.del(cacheKey);

    return config;
  }

  async getAllConfigs(category?: string): Promise<PlatformConfig[]> {
    if (category) {
      return this.configRepo.find({ where: { category }, order: { key: 'ASC' } });
    }
    return this.configRepo.find({ order: { category: 'ASC', key: 'ASC' } });
  }

  async getConfigHistory(key: string): Promise<ConfigVersion[]> {
    return this.versionRepo.find({
      where: { configKey: key },
      order: { changedAt: 'DESC' },
    });
  }

  async rollbackConfig(configVersionId: string, adminId: string): Promise<PlatformConfig> {
    const version = await this.versionRepo.findOne({ where: { id: configVersionId } });

    if (!version) {
      throw new NotFoundException('Config version not found');
    }

    const config = await this.configRepo.findOne({ where: { key: version.configKey } });

    if (!config) {
      throw new NotFoundException(`Config key '${version.configKey}' not found`);
    }

    const newValue = { ...version.oldValue };

    const rollbackVersion = this.versionRepo.create({
      configKey: version.configKey,
      oldValue: { ...config.value },
      newValue,
      changedBy: adminId,
      changeReason: `Rollback to version ${configVersionId}`,
    });
    await this.versionRepo.save(rollbackVersion);

    config.value = newValue;
    await this.configRepo.save(config);

    const cacheKey = `${CACHE_PREFIX}${config.key}`;
    await this.redis.del(cacheKey);

    return config;
  }

  async initDefaults(): Promise<void> {
    const count = await this.configRepo.count();
    if (count > 0) return;

    this.logger.log('Seeding default platform configs');

    for (const defaultConfig of DEFAULT_CONFIGS) {
      const config = this.configRepo.create(defaultConfig);
      await this.configRepo.save(config);
    }

    this.logger.log(`Seeded ${DEFAULT_CONFIGS.length} default platform configs`);
  }
}
