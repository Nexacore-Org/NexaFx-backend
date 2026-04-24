import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan, LessThanOrEqual } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey } from '../entities/api-key.entity';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditEntityType } from '../../audit-logs/enums/audit-entity-type.enum';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly KEY_BYTES = 48; // 384 bits of entropy

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Generate a new API key
   * Returns the plaintext key ONCE - it cannot be retrieved later
   */
  async generateKey(
    name: string,
    scopes: string[],
    expiresAt?: Date,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    // Generate cryptographically secure random key
    const randomBytes = crypto.randomBytes(this.KEY_BYTES);
    const key = randomBytes.toString('base64url');

    // Extract prefix and hash the full key
    const prefix = key.substring(0, 8);
    const hashedKey = this.hashKey(key);

    // Create and save API key
    const apiKey = this.apiKeyRepository.create({
      name,
      prefix,
      hashedKey,
      scopes,
      expiresAt: expiresAt || null,
      isActive: true,
    });

    await this.apiKeyRepository.save(apiKey);

    // Log key creation
    await this.auditLogsService.createLog({
      action: 'API_KEY_CREATED',
      entity: AuditEntityType.SYSTEM,
      entityId: apiKey.id,
      metadata: {
        name,
        scopes,
        prefix,
        expiresAt,
      },
    });

    return { key, apiKey };
  }

  /**
   * Validate an API key
   * Returns the API key entity if valid, throws exception otherwise
   */
  async validateKey(apiKey: string): Promise<ApiKey> {
    if (!apiKey || apiKey.length < 8) {
      throw new UnauthorizedException('Invalid API key format');
    }

    // Extract prefix for lookup
    const prefix = apiKey.substring(0, 8);
    const hashedKey = this.hashKey(apiKey);

    // Find key by prefix
    const storedKey = await this.apiKeyRepository.findOne({
      where: {
        prefix,
        isActive: true,
      },
    });

    if (!storedKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Timing-safe comparison of hashes
    const isValid = this.timingSafeCompare(storedKey.hashedKey, hashedKey);

    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Check expiration
    if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Double-check active status (in case it was revoked between query and now)
    if (!storedKey.isActive) {
      throw new UnauthorizedException('API key has been revoked');
    }

    return storedKey;
  }

  /**
   * Revoke an API key immediately
   */
  async revokeKey(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    apiKey.isActive = false;
    await this.apiKeyRepository.save(apiKey);

    // Log revocation
    await this.auditLogsService.createLog({
      action: 'API_KEY_REVOKED',
      entity: AuditEntityType.SYSTEM,
      entityId: apiKey.id,
      metadata: {
        name: apiKey.name,
        prefix: apiKey.prefix,
      },
    });
  }

  /**
   * Rotate an API key
   * Generates a new key and sets the old key to expire after grace period
   */
  async rotateKey(
    id: string,
    gracePeriodMinutes: number = 5,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    const oldKey = await this.apiKeyRepository.findOne({ where: { id } });

    if (!oldKey) {
      throw new NotFoundException('API key not found');
    }

    if (!oldKey.isActive) {
      throw new BadRequestException('Cannot rotate a revoked API key');
    }

    // Set old key to expire after grace period
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setMinutes(gracePeriodEnd.getMinutes() + gracePeriodMinutes);
    oldKey.expiresAt = gracePeriodEnd;
    await this.apiKeyRepository.save(oldKey);

    // Generate new key with same scopes
    const { key, apiKey: newKey } = await this.generateKey(
      `${oldKey.name} (rotated)`,
      oldKey.scopes,
      oldKey.expiresAt, // Same expiration or null
    );

    // Log rotation
    await this.auditLogsService.createLog({
      action: 'API_KEY_ROTATED',
      entity: AuditEntityType.SYSTEM,
      entityId: newKey.id,
      metadata: {
        oldKeyId: oldKey.id,
        oldKeyPrefix: oldKey.prefix,
        newKeyPrefix: newKey.prefix,
        gracePeriodMinutes,
        gracePeriodEnd,
      },
    });

    return { key, apiKey: newKey };
  }

  /**
   * Log API key usage
   */
  async logUsage(
    apiKeyId: string,
    endpoint: string,
    statusCode: number,
    latencyMs: number,
  ): Promise<void> {
    try {
      // Update lastUsedAt
      await this.apiKeyRepository.update(apiKeyId, {
        lastUsedAt: new Date(),
      });

      // Create audit log
      await this.auditLogsService.createLog({
        action: 'API_KEY_USAGE',
        entity: AuditEntityType.SYSTEM,
        entityId: apiKeyId,
        metadata: {
          endpoint,
          statusCode,
          latencyMs,
        },
      });
    } catch (error) {
      // Don't throw error to prevent breaking main functionality
      this.logger.error(
        `Failed to log API key usage: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * List API keys with pagination and filtering
   */
  async listKeys(filters: {
    isActive?: boolean;
    scope?: string;
    page?: number;
    limit?: number;
  }): Promise<{ keys: ApiKey[]; total: number }> {
    const { isActive, scope, page = 1, limit = 20 } = filters;

    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (scope) {
      where.scopes = `@> '{${scope}}'`; // PostgreSQL array contains operator
    }

    const [keys, total] = await this.apiKeyRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { keys, total };
  }

  /**
   * Get API key by ID (for admin operations)
   */
  async getKeyById(id: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return apiKey;
  }

  /**
   * Hash an API key using SHA-256
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Timing-safe comparison to prevent timing attacks
   */
  private timingSafeCompare(storedHash: string, providedHash: string): boolean {
    if (storedHash.length !== providedHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(providedHash, 'hex'),
    );
  }
}
