import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { MicroSavingsRule, MicroSavingsTriggerType } from './entities/micro-savings-rule.entity';
import { MicroSavingsContribution } from './entities/micro-savings-contribution.entity';
import { VaultsService } from '../../vaults/vaults.service';
import { UsersService } from '../../users/users.service';
import { CreateMicroSavingsRuleDto, UpdateMicroSavingsRuleDto } from './dto/micro-savings.dto';

@Injectable()
export class MicroSavingsService {
  private readonly logger = new Logger(MicroSavingsService.name);

  constructor(
    @InjectRepository(MicroSavingsRule)
    private readonly ruleRepo: Repository<MicroSavingsRule>,
    @InjectRepository(MicroSavingsContribution)
    private readonly contributionRepo: Repository<MicroSavingsContribution>,
    private readonly vaultsService: VaultsService,
    private readonly usersService: UsersService,
  ) {}

  async createRule(userId: string, dto: CreateMicroSavingsRuleDto): Promise<MicroSavingsRule> {
    const rule = this.ruleRepo.create({
      userId,
      targetVaultId: dto.targetVaultId,
      triggerType: dto.triggerType,
      saveAmount: dto.saveAmount.toString(),
      perTransactionConfig: dto.perTransactionConfig ?? null,
      balanceThresholdConfig: dto.balanceThresholdConfig ?? null,
      maxDailyContribution: dto.maxDailyContribution.toString(),
    });
    return this.ruleRepo.save(rule);
  }

  async listActiveRules(userId: string): Promise<(MicroSavingsRule & { todayContribution: number })[]> {
    const rules = await this.ruleRepo.find({ where: { userId, isActive: true }, order: { createdAt: 'DESC' } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Promise.all(rules.map(async (rule) => {
      const todayTotal = await this.contributionRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.amount), 0)', 'total')
        .where('c.ruleId = :ruleId', { ruleId: rule.id })
        .andWhere('c.createdAt >= :today', { today })
        .getRawOne<{ total: string }>();
      return { ...rule, todayContribution: parseFloat(todayTotal?.total ?? '0') };
    }));
  }

  async updateRule(userId: string, ruleId: string, dto: UpdateMicroSavingsRuleDto): Promise<MicroSavingsRule> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId, userId } });
    if (!rule) throw new NotFoundException('Micro-savings rule not found');
    if (dto.targetVaultId) rule.targetVaultId = dto.targetVaultId;
    if (dto.saveAmount !== undefined) rule.saveAmount = dto.saveAmount.toString();
    if (dto.perTransactionConfig !== undefined) rule.perTransactionConfig = dto.perTransactionConfig;
    if (dto.balanceThresholdConfig !== undefined) rule.balanceThresholdConfig = dto.balanceThresholdConfig;
    if (dto.maxDailyContribution !== undefined) rule.maxDailyContribution = dto.maxDailyContribution.toString();
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    return this.ruleRepo.save(rule);
  }

  async deleteRule(userId: string, ruleId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId, userId } });
    if (!rule) throw new NotFoundException('Micro-savings rule not found');
    await this.ruleRepo.remove(rule);
  }

  async getHistory(userId: string, page = 1, limit = 50): Promise<{ contributions: MicroSavingsContribution[]; total: number }> {
    const [contributions, total] = await this.contributionRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { contributions, total };
  }

  async getTodayContributionTotal(ruleId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await this.contributionRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.amount), 0)', 'total')
      .where('c.ruleId = :ruleId', { ruleId })
      .andWhere('c.createdAt >= :today', { today })
      .getRawOne<{ total: string }>();
    return parseFloat(result?.total ?? '0');
  }

  async evaluatePerTransaction(userId: string, transactionId: string, transactionAmount: number, currency: string): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { userId, isActive: true, triggerType: MicroSavingsTriggerType.PER_TRANSACTION },
    });

    for (const rule of rules) {
      try {
        const cfg = rule.perTransactionConfig ?? {};
        if (cfg.minTransactionAmount && transactionAmount < cfg.minTransactionAmount) continue;

        let saveAmount = parseFloat(rule.saveAmount);
        if (cfg.savePercent && cfg.savePercent > 0) {
          saveAmount = transactionAmount * (cfg.savePercent / 100);
        }

        const dailyCap = parseFloat(rule.maxDailyContribution);
        const todayTotal = await this.getTodayContributionTotal(rule.id);
        const remaining = dailyCap - todayTotal;
        if (remaining <= 0) continue;
        saveAmount = Math.min(saveAmount, remaining);
        if (saveAmount <= 0) continue;

        await this.depositToVault(rule, saveAmount, 'PER_TRANSACTION', transactionId);
      } catch (err) {
        this.logger.error(`Per-transaction micro-savings failed for rule ${rule.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async evaluateBalanceThreshold(userId: string, currency: string): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { userId, isActive: true, triggerType: MicroSavingsTriggerType.BALANCE_THRESHOLD },
    });

    const user = await this.usersService.findById(userId);
    if (!user) return;

    const balance = parseFloat(user.balances?.[currency]?.toString() ?? '0');

    for (const rule of rules) {
      try {
        const cfg = rule.balanceThresholdConfig ?? {};
        const threshold = cfg.thresholdAmount ?? 0;
        if (balance <= threshold) continue;

        let saveAmount: number;
        if (cfg.saveExcess) {
          saveAmount = balance - threshold;
        } else {
          saveAmount = parseFloat(rule.saveAmount);
        }

        const dailyCap = parseFloat(rule.maxDailyContribution);
        const todayTotal = await this.getTodayContributionTotal(rule.id);
        const remaining = dailyCap - todayTotal;
        saveAmount = Math.min(saveAmount, remaining);
        if (saveAmount <= 0) continue;

        await this.depositToVault(rule, saveAmount, 'BALANCE_THRESHOLD', null);
      } catch (err) {
        this.logger.error(`Balance-threshold micro-savings failed for rule ${rule.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async evaluateSpendingGoalHit(userId: string, spendingGoalId: string): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { userId, isActive: true, triggerType: MicroSavingsTriggerType.SPENDING_GOAL_HIT },
    });

    for (const rule of rules) {
      try {
        const saveAmount = parseFloat(rule.saveAmount);
        const dailyCap = parseFloat(rule.maxDailyContribution);
        const todayTotal = await this.getTodayContributionTotal(rule.id);
        const remaining = dailyCap - todayTotal;
        const amount = Math.min(saveAmount, remaining);
        if (amount <= 0) continue;

        await this.depositToVault(rule, amount, 'SPENDING_GOAL_HIT', null, spendingGoalId);
      } catch (err) {
        this.logger.error(`Spending-goal-hit micro-savings failed for rule ${rule.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async depositToVault(
    rule: MicroSavingsRule,
    amount: number,
    triggerType: string,
    sourceTransactionId: string | null,
    sourceSpendingGoalId?: string | null,
  ): Promise<void> {
    await this.vaultsService.deposit(rule.userId, rule.targetVaultId, amount);

    const contribution = this.contributionRepo.create({
      ruleId: rule.id,
      userId: rule.userId,
      vaultId: rule.targetVaultId,
      amount: amount.toString(),
      triggerType,
      sourceTransactionId: sourceTransactionId ?? null,
      sourceSpendingGoalId: sourceSpendingGoalId ?? null,
    });
    await this.contributionRepo.save(contribution);
  }
}
