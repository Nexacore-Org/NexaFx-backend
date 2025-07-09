import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FeeRule } from './entities/fee.entity';
import { TransactionType } from 'src/transactions/enums/transaction-type.enum';

@Injectable()
export class FeeService {
  constructor(
    @InjectRepository(FeeRule)
    private readonly feeRuleRepo: Repository<FeeRule>,
  ) {}

  async calculateFee(params: {
    transactionType: TransactionType;
    amount: number;
    currencyId: string;
  }): Promise<{
    feeAmount: number;
    appliedRule: FeeRule | null;
    feePercent: number;
  }> {
    const { transactionType, amount, currencyId } = params;

    const rule = await this.feeRuleRepo.findOne({
      where: {
        transactionType: transactionType,
        currencyId: currencyId,
        isActive: true,
        // volume range logic
        minTransactionAmount: Between(0, amount),
        maxTransactionAmount: Between(amount, Number.MAX_SAFE_INTEGER),
      },
    });

    if (!rule) {
      // fallback rule (applies to ALL)
      const fallbackRule = await this.feeRuleRepo.findOne({
        where: {
          transactionType: transactionType,
          currencyId: currencyId,
          isActive: true,
        },
      });

      if (!fallbackRule)
        return { feeAmount: 0, appliedRule: null, feePercent: 0 };

      const fallbackBaseFee = (amount * fallbackRule.feePercentage) / 100;
      const fallbackDiscount = fallbackRule.discountPercentage
        ? (fallbackBaseFee * fallbackRule.discountPercentage) / 100
        : 0;
      const fallbackFinalFee = fallbackBaseFee - fallbackDiscount;

      return {
        feeAmount: parseFloat(fallbackFinalFee.toFixed(2)),
        appliedRule: fallbackRule,
        feePercent: fallbackRule.feePercentage,
      };
    }

    const baseFee = (amount * rule.feePercentage) / 100;
    const discount = rule.discountPercentage
      ? (baseFee * rule.discountPercentage) / 100
      : 0;
    const finalFee = baseFee - discount;

    return {
      feeAmount: parseFloat(finalFee.toFixed(2)),
      appliedRule: rule,
      feePercent: rule.feePercentage,
    };
  }

  async findAll(): Promise<FeeRule[]> {
    return this.feeRuleRepo.find({ relations: ['currency'] });
  }

  async findOne(id: string): Promise<FeeRule> {
    const rule = await this.feeRuleRepo.findOne({
      where: { id },
      relations: ['currency'],
    });
    if (!rule) {
      throw new NotFoundException(`Fee rule with ID ${id} not found`);
    }
    return rule;
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
