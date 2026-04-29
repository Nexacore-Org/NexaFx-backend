import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';
import { createHash } from 'crypto';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly idempotencyRepository: Repository<IdempotencyRecord>,
  ) {}

  /**
   * Generate SHA-256 hash of the request body
   */
  generateRequestHash(body: any): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(body));
    return hash.digest('hex');
  }

  /**
   * Check if an idempotency record exists for the given key and userId
   * If exists and matches the request hash, return the stored response
   * If exists but request hash differs, throw conflict error
   * If not exists, return null
   */
  async checkIdempotency(
    key: string,
    userId: string,
    requestBody: any,
  ): Promise<{ statusCode: number; body: any } | null> {
    const requestHash = this.generateRequestHash(requestBody);
    const record = await this.idempotencyRepository.findOne({
      where: { key, userId },
    });

    if (!record) {
      return null;
    }

    if (record.requestHash !== requestHash) {
      // Conflict: same key but different body
      const error = new Error('IDEMPOTENCY_KEY_CONFLICT');
      error['code'] = 'IDEMPOTENCY_KEY_CONFLICT';
      throw error;
    }

    // Return stored response
    return {
      statusCode: record.responseStatus,
      body: record.responseBody,
    };
  }

  /**
   * Store the idempotency record for the request
   */
  async storeIdempotency(
    key: string,
    userId: string,
    endpoint: string,
    requestBody: any,
    responseStatus: number,
    responseBody: any,
  ): Promise<void> {
    const requestHash = this.generateRequestHash(requestBody);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    const record = this.idempotencyRepository.create({
      key,
      userId,
      endpoint,
      requestHash,
      responseStatus,
      responseBody,
      expiresAt,
    });

    await this.idempotencyRepository.save(record);
  }
}