import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { FeatureFlag } from './entities/feature-flag.entity';
import {
  CreateFeatureFlagDto,
  FEATURE_FLAG_KEY_REGEX,
  UpdateFeatureFlagDto,
} from './dto';
import type { AuditLogsService } from '../../audit-logs/audit-logs.service';

@Injectable()
export class FlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagsRepository: Repository<FeatureFlag>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    @Optional()
    private readonly auditLogsService?: Pick<AuditLogsService, 'createLog'>,
  ) {}

  /**
   * Internal method to retrieve a flag.
   * Hits the cache first; if missing, falls back to DB and caches for 60s.
   */
  private async getFlag(key: string): Promise<FeatureFlag | null> {
    if (!key || key.startsWith('archived_')) {
      return null;
    }

    const cacheKey = `flag_${key}`;
    const cachedFlag = await this.cacheManager.get<FeatureFlag>(cacheKey);

    if (cachedFlag) {
      return cachedFlag;
    }

    const flag = await this.flagsRepository.findOne({ where: { key } });
    if (flag && !flag.key?.startsWith('archived_')) {
      // TTL is in milliseconds for cache-manager v5
      await this.cacheManager.set(cacheKey, flag, 60000);
      return flag;
    }
    return null;
  }

  /**
   * Evaluate an already-loaded FeatureFlag entity without extra cache or DB hits.
   */
  evaluateFlagEntity(flag: FeatureFlag, userId?: string): boolean {
    if (!flag || !flag.isEnabled || flag.key?.startsWith('archived_')) {
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
      .update(`${userId}-${flag.key}`)
      .digest('hex');

    // Parse first 8 hex chars as an integer and get 0-99
    const hashInt = parseInt(hashHex.substring(0, 8), 16);
    const hashPercent = hashInt % 100;

    return hashPercent < flag.rolloutPercent;
  }

  /**
   * Determine if a feature flag is enabled for a given context.
   */
  async isEnabled(key: string, userId?: string): Promise<boolean> {
    const flag = await this.getFlag(key);
    if (!flag) {
      return false;
    }
    return this.evaluateFlagEntity(flag, userId);
  }

  private sanitizeAndValidatePayload(
    data: Partial<CreateFeatureFlagDto & UpdateFeatureFlagDto & FeatureFlag>,
  ): Partial<FeatureFlag> {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Invalid feature flag payload');
    }

    if (data.key !== undefined) {
      if (
        typeof data.key !== 'string' ||
        !FEATURE_FLAG_KEY_REGEX.test(data.key)
      ) {
        throw new BadRequestException(
          'key must be alphanumeric (with underscores or hyphens) and must not start with archived_',
        );
      }
    }

    if (data.rolloutPercent !== undefined) {
      if (
        typeof data.rolloutPercent !== 'number' ||
        !Number.isInteger(data.rolloutPercent) ||
        data.rolloutPercent < 0 ||
        data.rolloutPercent > 100
      ) {
        throw new BadRequestException(
          'rolloutPercent must be an integer between 0 and 100',
        );
      }
    }

    if ('environments' in data && data.environments !== undefined) {
      if (
        !Array.isArray(data.environments) ||
        data.environments.some((env) => typeof env !== 'string')
      ) {
        throw new BadRequestException(
          'environments must be an array of strings',
        );
      }
    }

    if (
      'targetUserIds' in data &&
      data.targetUserIds !== undefined &&
      data.targetUserIds !== null
    ) {
      if (
        !Array.isArray(data.targetUserIds) ||
        data.targetUserIds.some((id) => typeof id !== 'string')
      ) {
        throw new BadRequestException(
          'targetUserIds must be an array of UUID strings',
        );
      }
    }

    const sanitized: Partial<FeatureFlag> = {};
    if (data.key !== undefined) sanitized.key = data.key;
    if (data.name !== undefined) sanitized.name = data.name;
    if (data.description !== undefined)
      sanitized.description = data.description;
    if (data.isEnabled !== undefined) sanitized.isEnabled = data.isEnabled;
    if (data.rolloutPercent !== undefined) {
      sanitized.rolloutPercent = data.rolloutPercent;
    }
    if (data.targetUserIds !== undefined) {
      sanitized.targetUserIds = data.targetUserIds;
    }
    if (data.environments !== undefined) {
      sanitized.environments = data.environments;
    }
    return sanitized;
  }

  private async findActiveFlagByIdOrThrow(id: string): Promise<FeatureFlag> {
    let flag = await this.flagsRepository.findOne({ where: { id } });
    if (
      flag === undefined &&
      typeof this.flagsRepository.findOneOrFail === 'function'
    ) {
      try {
        flag = await this.flagsRepository.findOneOrFail({ where: { id } });
      } catch {
        flag = null;
      }
    }

    if (!flag || flag.key?.startsWith('archived_')) {
      throw new NotFoundException(`Feature flag "${id}" not found`);
    }
    return flag;
  }

  async findById(id: string): Promise<FeatureFlag | null> {
    const flag = await this.flagsRepository.findOne({ where: { id } });
    if (!flag || flag.key?.startsWith('archived_')) {
      return null;
    }
    return flag;
  }

  async listFlags(): Promise<FeatureFlag[]> {
    const flags = await this.flagsRepository.find();
    return (flags ?? []).filter((flag) => !flag.key?.startsWith('archived_'));
  }

  async createFlag(
    data: Partial<CreateFeatureFlagDto & FeatureFlag>,
    actorId?: string,
  ): Promise<FeatureFlag> {
    const sanitized = this.sanitizeAndValidatePayload(data);
    const flag = this.flagsRepository.create(sanitized);
    const saved = await this.flagsRepository.save(flag);

    if (saved?.key) {
      await this.cacheManager.del(`flag_${saved.key}`);
    }

    await this.auditLogsService?.createLog({
      action: 'FEATURE_FLAG_CREATED',
      actorId: actorId ?? 'system',
      resourceType: 'feature_flag',
      resourceId: saved?.id,
      metadata: { key: saved?.key, isEnabled: saved?.isEnabled },
    } as any);

    return saved;
  }

  async updateFlag(
    id: string,
    data: Partial<UpdateFeatureFlagDto & FeatureFlag>,
    actorId?: string,
  ): Promise<FeatureFlag> {
    const sanitized = this.sanitizeAndValidatePayload(data);
    const flag = await this.findActiveFlagByIdOrThrow(id);
    const previousKey = flag.key;

    Object.assign(flag, sanitized);
    const saved = await this.flagsRepository.save(flag);

    await this.cacheManager.del(`flag_${previousKey}`);
    if (saved.key && saved.key !== previousKey) {
      await this.cacheManager.del(`flag_${saved.key}`);
    }

    await this.auditLogsService?.createLog({
      action: 'FEATURE_FLAG_UPDATED',
      actorId: actorId ?? 'system',
      resourceType: 'feature_flag',
      resourceId: saved.id,
      metadata: {
        previousKey,
        newKey: saved.key,
        updatedFields: Object.keys(sanitized),
      },
    } as any);

    return saved;
  }

  async deleteFlag(id: string, actorId?: string): Promise<void> {
    const flag = await this.findActiveFlagByIdOrThrow(id);
    const originalKey = flag.key;
    flag.isEnabled = false;
    flag.key = `archived_${Date.now()}_${flag.key}`; // avoid unique constraint if re-created
    await this.flagsRepository.save(flag);
    await this.cacheManager.del(`flag_${originalKey}`);

    await this.auditLogsService?.createLog({
      action: 'FEATURE_FLAG_DELETED',
      actorId: actorId ?? 'system',
      resourceType: 'feature_flag',
      resourceId: flag.id,
      metadata: { originalKey, archivedKey: flag.key },
    } as any);
  }

  async checkFlagForUser(
    id: string,
    userId?: string,
  ): Promise<{ enabled: boolean }> {
    const flag = await this.findById(id);
    if (!flag) {
      return { enabled: false };
    }
    return { enabled: this.evaluateFlagEntity(flag, userId) };
  }

  async getFlagsForUser(userId: string): Promise<Record<string, boolean>> {
    const allFlags = await this.flagsRepository.find();
    const result: Record<string, boolean> = {};
    for (const flag of allFlags ?? []) {
      if (!flag.key || flag.key.startsWith('archived_') || !flag.isEnabled) {
        continue;
      }
      result[flag.key] = this.evaluateFlagEntity(flag, userId);
    }
    return result;
  }
}
