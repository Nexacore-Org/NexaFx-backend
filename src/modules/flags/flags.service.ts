import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { FeatureFlag } from './entities/feature-flag.entity';

@Injectable()
export class FlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagsRepository: Repository<FeatureFlag>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Internal method to retrieve a flag.
   * Hits the cache first; if missing, falls back to DB and caches for 60s.
   */
  private async getFlag(key: string): Promise<FeatureFlag | null> {
    const cacheKey = `flag_${key}`;
    const cachedFlag = await this.cacheManager.get<FeatureFlag>(cacheKey);

    if (cachedFlag) {
      return cachedFlag;
    }

    const flag = await this.flagsRepository.findOne({ where: { key } });
    if (flag) {
      // TTL is in milliseconds for cache-manager v5
      await this.cacheManager.set(cacheKey, flag, 60000);
    }
    return flag;
  }

  /**
   * Determine if a feature flag is enabled for a given context.
   */
  async isEnabled(key: string, userId?: string): Promise<boolean> {
    const flag = await this.getFlag(key);

    if (!flag || !flag.isEnabled) {
      return false;
    }

    const currentEnv =
      this.configService.get<string>('NODE_ENV') || 'development';
    if (!flag.environments || !flag.environments.includes(currentEnv)) {
      return false;
    }

    if (userId && flag.targetUserIds && flag.targetUserIds.includes(userId)) {
      return true;
    }

    if (flag.rolloutPercent === 100) return true;
    if (flag.rolloutPercent === 0) return false;

    if (!userId) {
      // If a feature is partially rolled out, anonymous users do not get it.
      return false;
    }

    // Deterministic hash of userId + key for stable rollout result
    const hashHex = crypto
      .createHash('sha256')
      .update(`${userId}-${key}`)
      .digest('hex');

    // Parse first 8 hex chars as an integer and get 0-99
    const hashInt = parseInt(hashHex.substring(0, 8), 16);
    const hashPercent = hashInt % 100;

    return hashPercent < flag.rolloutPercent;
  }

  async listFlags(): Promise<FeatureFlag[]> {
    return this.flagsRepository.find();
  }

  async createFlag(data: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const flag = this.flagsRepository.create(data);
    return this.flagsRepository.save(flag);
  }

  async updateFlag(
    id: string,
    data: Partial<FeatureFlag>,
  ): Promise<FeatureFlag> {
    const flag = await this.flagsRepository.findOneOrFail({ where: { id } });
    Object.assign(flag, data);
    const saved = await this.flagsRepository.save(flag);
    await this.cacheManager.del(`flag_${saved.key}`);
    return saved;
  }

  async deleteFlag(id: string): Promise<void> {
    const flag = await this.flagsRepository.findOneOrFail({ where: { id } });
    const originalKey = flag.key;
    flag.isEnabled = false;
    flag.key = `archived_${Date.now()}_${flag.key}`; // avoid unique constraint if re-created
    await this.flagsRepository.save(flag);
    await this.cacheManager.del(`flag_${originalKey}`);
  }

  async getFlagsForUser(userId: string): Promise<Record<string, boolean>> {
    const allFlags = await this.flagsRepository.find();
    const result: Record<string, boolean> = {};
    for (const flag of allFlags) {
      result[flag.key] = await this.isEnabled(flag.key, userId);
    }
    return result;
  }
}
