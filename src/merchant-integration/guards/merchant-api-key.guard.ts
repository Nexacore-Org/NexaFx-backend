import { Injectable, CanActivate, ExecutionContext, UnauthorizedError } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MerchantApiKey } from '../entities/merchant-api-key.entity';

@Injectable()
export class MerchantApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(MerchantApiKey)
    private readonly apiKeyRepo: Repository<MerchantApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || request.headers['x-api-key'];

    if (!authHeader) {
      throw new UnauthorizedException('API key is missing');
    }

    const rawKey = authHeader.replace('Bearer ', '').trim();
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepo.findOne({ where: { keyHash, isActive: true } });
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    apiKey.lastUsedAt = new Date();
    await this.apiKeyRepo.save(apiKey);

    request.merchantId = apiKey.merchantId;
    return true;
  }
}