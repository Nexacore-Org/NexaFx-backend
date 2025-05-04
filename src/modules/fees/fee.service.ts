// src/modules/fees/fee.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FeeRule } from './fee.entity';

@Injectable()
export class FeeService {
  constructor(
    @InjectRepository(FeeRule)
    private readonly feeRuleRepo: Repository<FeeRule>,
  ) {}

  async calculateFee(params: {
    userTier: string;
    transactionType: string;
    amount: number;
  }): Promise<{ feeAmount: number; appliedRule: FeeRule | null }> {
    const { userTier, transactionType, amount } = params;

    const rule = await this.feeRuleRepo.findOne({
      where: {
        userTier,
        transactionType,
        isActive: true,
        minVolume: Between(0, amount),
        maxVolume: Between(amount, Number.MAX_SAFE_INTEGER),
      },
    });

    if (!rule) return { feeAmount: 0, appliedRule: null };

    const baseFee = (amount * rule.feePercentage) / 100;
    const discount = rule.discountPercentage
      ? (baseFee * rule.discountPercentage) / 100
      : 0;

    const finalFee = baseFee - discount;

    return { feeAmount: parseFloat(finalFee.toFixed(2)), appliedRule: rule };
  }

  async findAll(): Promise<FeeRule[]> {
    return this.feeRuleRepo.find();
  }

  async findOne(id: string): Promise<FeeRule> {
    return this.feeRuleRepo.findOneBy({ id });
  }

  async create(data: Partial<FeeRule>): Promise<FeeRule> {
    const rule = this.feeRuleRepo.create(data);
    return this.feeRuleRepo.save(rule);
  }

  async update(id: string, data: Partial<FeeRule>): Promise<FeeRule> {
    await this.feeRuleRepo.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.feeRuleRepo.delete(id);
  }
}