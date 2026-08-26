import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PaymentCorridor, KycTierRequired } from './entities/payment-corridor.entity';

const CACHE_TTL = 900;
const KYC_TIER_ORDER: Record<string, number> = {
  [KycTierRequired.BASIC]: 0,
  [KycTierRequired.STANDARD]: 1,
  [KycTierRequired.ENHANCED]: 2,
};

@Injectable()
export class CorridorsService {
  private readonly logger = new Logger(CorridorsService.name);

  constructor(
    @InjectRepository(PaymentCorridor)
    private readonly corridorRepo: Repository<PaymentCorridor>,
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async discoverCorridors(
    sourceCurrency: string,
    destCurrency: string,
    amount: number,
    country?: string,
  ): Promise<PaymentCorridor[]> {
    const cacheKey = `corridors:discover:${sourceCurrency}:${destCurrency}:${amount}:${country || 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const qb = this.corridorRepo.createQueryBuilder('corridor')
      .where('corridor.isActive = :isActive', { isActive: true })
      .andWhere('corridor.sourceCurrency = :sourceCurrency', { sourceCurrency })
      .andWhere('corridor.destinationCurrency = :destCurrency', { destCurrency })
      .andWhere('corridor.minAmount <= :amount', { amount })
      .andWhere('corridor.maxAmount >= :amount', { amount });

    if (country) {
      qb.andWhere('corridor.sourceCountry = :country', { country });
    }

    const corridors = await qb.getMany();

    await this.redis.set(cacheKey, JSON.stringify(corridors), 'EX', CACHE_TTL);
    return corridors;
  }

  async validateCorridor(
    corridorId: string,
    userKycTier: string,
    amount: number,
  ): Promise<{ valid: boolean; corridor: PaymentCorridor; reason?: string }> {
    const corridor = await this.corridorRepo.findOne({ where: { id: corridorId } });

    if (!corridor) {
      throw new NotFoundException('Payment corridor not found');
    }

    if (!corridor.isActive) {
      return { valid: false, corridor, reason: 'Corridor is currently inactive' };
    }

    const minAmount = parseFloat(corridor.minAmount);
    const maxAmount = parseFloat(corridor.maxAmount);

    if (amount < minAmount) {
      return { valid: false, corridor, reason: `Amount below minimum: ${minAmount}` };
    }

    if (amount > maxAmount) {
      return { valid: false, corridor, reason: `Amount exceeds maximum: ${maxAmount}` };
    }

    const userTier = KYC_TIER_ORDER[userKycTier] ?? -1;
    const requiredTier = KYC_TIER_ORDER[corridor.requiredKycTier] ?? 0;

    if (userTier < requiredTier) {
      return {
        valid: false,
        corridor,
        reason: `KYC tier ${corridor.requiredKycTier} or higher required`,
      };
    }

    return { valid: true, corridor };
  }

  async createCorridor(data: Partial<PaymentCorridor>): Promise<PaymentCorridor> {
    const corridor = this.corridorRepo.create(data);
    return this.corridorRepo.save(corridor);
  }

  async listCorridors(): Promise<PaymentCorridor[]> {
    return this.corridorRepo.find({ order: { createdAt: 'DESC' } });
  }

  async updateCorridor(id: string, data: Partial<PaymentCorridor>): Promise<PaymentCorridor> {
    const corridor = await this.corridorRepo.findOne({ where: { id } });

    if (!corridor) {
      throw new NotFoundException('Payment corridor not found');
    }

    Object.assign(corridor, data);
    return this.corridorRepo.save(corridor);
  }
}
