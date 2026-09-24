import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class PendingRetryService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly secretKey = Buffer.from(process.env.PENDING_RETRY_SECRET || '32-byte-long-secret-key-phrase!!');

  constructor(
    private readonly cacheManager: any, // Redis/Cache store
    private readonly analyticsService: AnalyticsService,
  ) {}

  private encrypt(payload: string): { encryptedData: string; iv: string; tag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.secretKey, iv);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return { encryptedData: encrypted, iv: iv.toString('hex'), tag };
  }

  private decrypt(encryptedData: string, ivHex: string, tagHex: string): string {
    const decipher = createDecipheriv(this.algorithm, this.secretKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async storePendingRetry(userId: string, originalRequest: any): Promise<{ id: string }> {
    const id = randomBytes(16).toString('hex');
    const serialized = JSON.stringify(originalRequest);
    const encrypted = this.encrypt(serialized);

    const record = {
      id,
      userId,
      payload: encrypted,
      createdAt: new Date().toISOString(),
    };

    // Store in cache/database with 24h TTL (86400 seconds)
    await this.cacheManager.set(`pending_retry:${id}`, record, 86400);

    return { id };
  }

  async executePendingRetry(id: string, userId: string, httpAdapterHost: any): Promise<any> {
    const record = await this.cacheManager.get(`pending_retry:${id}`);
    if (!record || record.userId !== userId) {
      throw new NotFoundException('Pending retry request not found or expired.');
    }

    const { encryptedData, iv, tag } = record.payload;
    const rawPayload = this.decrypt(encryptedData, iv, tag);
    const originalRequest = JSON.parse(rawPayload);

    // Track analytics event: user retried original action
    await this.analyticsService.trackEvent({
      userId,
      event: 'USER_RETRIED_ORIGINAL_ACTION',
      properties: { retryId: id, url: originalRequest.url },
    });

    // Remove key after execution
    await this.cacheManager.del(`pending_retry:${id}`);

    // Internal dispatch or proxy to re-execute request
    return originalRequest;
  }
}