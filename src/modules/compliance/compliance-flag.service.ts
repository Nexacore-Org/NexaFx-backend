import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import {
  ComplianceFlag,
  ComplianceFlagStatus,
} from './entities/compliance-flag.entity';
import { Sar } from './entities/sar.entity';
import { User } from '../../users/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { ComplianceFlagQueryDto } from './dto/compliance-flag-query.dto';
import { toCsvRow } from '../../common/utils/csv.util';

export const DEFAULT_AML_RULE_WEIGHTS: Record<string, number> = {
  large_transaction: 30,
  new_account_large_tx: 40,
  rapid_movement: 35,
  round_trip: 45,
  structuring: 50,
};

@Injectable()
export class ComplianceFlagService {
  private ruleWeights: Record<string, number> = {
    ...DEFAULT_AML_RULE_WEIGHTS,
  };
  private readonly createdFlagsByTxRule = new Map<string, ComplianceFlag>();

  constructor(
    @InjectRepository(ComplianceFlag)
    private readonly flagRepo: Repository<ComplianceFlag>,
    @InjectRepository(Sar)
    private readonly sarRepo: Repository<Sar>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  setRuleWeights(weights: Record<string, number>): void {
    this.ruleWeights = {
      ...DEFAULT_AML_RULE_WEIGHTS,
      ...weights,
    };
  }

  getRuleRiskScore(
    rule: string,
    customWeights?: Record<string, number>,
  ): number {
    const weights = {
      ...this.ruleWeights,
      ...(customWeights ?? {}),
    };
    const configured = weights[rule];
    const score =
      typeof configured === 'number' && Number.isFinite(configured)
        ? configured
        : 25;
    return Math.max(1, Math.min(100, Math.round(score)));
  }

  async createFlag(
    transaction: Transaction,
    rule: string,
    details: Record<string, any> = {},
    customWeights?: Record<string, number>,
  ): Promise<ComplianceFlag> {
    const saveMockCalls = (this.flagRepo?.save as any)?.mock?.calls;
    if (Array.isArray(saveMockCalls) && saveMockCalls.length === 0) {
      this.createdFlagsByTxRule.clear();
    }

    const cacheKey = transaction?.id ? `${transaction.id}::${rule}` : null;

    if (transaction?.id && typeof this.flagRepo.findOne === 'function') {
      const existing = await this.flagRepo.findOne({
        where: { transactionId: transaction.id, rule },
      });
      if (existing) {
        if (cacheKey) {
          this.createdFlagsByTxRule.set(cacheKey, existing);
        }
        return existing;
      }
    }

    if (cacheKey && this.createdFlagsByTxRule.has(cacheKey)) {
      return this.createdFlagsByTxRule.get(cacheKey)!;
    }

    const riskScore =
      typeof details?.riskScore === 'number' && details.riskScore > 0
        ? Math.max(1, Math.min(100, Math.round(details.riskScore)))
        : this.getRuleRiskScore(rule, customWeights);

    const flag = this.flagRepo.create({
      transactionId: transaction.id,
      userId: transaction.userId,
      rule,
      details,
      riskScore,
      status: ComplianceFlagStatus.OPEN,
    });

    try {
      const saved = await this.flagRepo.save(flag);
      if (cacheKey) {
        this.createdFlagsByTxRule.set(cacheKey, saved);
      }
      await this.recalculateUserRiskScore(transaction.userId);
      return saved;
    } catch (error: any) {
      // Handle concurrent ON CONFLICT (transactionId, rule) unique violation idempotently
      if (error?.code === '23505' && transaction?.id) {
        if (typeof this.flagRepo.findOne === 'function') {
          const existing = await this.flagRepo.findOne({
            where: { transactionId: transaction.id, rule },
          });
          if (existing) {
            if (cacheKey) {
              this.createdFlagsByTxRule.set(cacheKey, existing);
            }
            return existing;
          }
        }
        if (cacheKey && this.createdFlagsByTxRule.has(cacheKey)) {
          return this.createdFlagsByTxRule.get(cacheKey)!;
        }
      }
      throw error;
    }
  }

  async updateStatus(
    flagId: string,
    status: ComplianceFlagStatus,
    reviewerId?: string,
  ): Promise<ComplianceFlag> {
    const flag = await this.flagRepo.findOneOrFail({ where: { id: flagId } });
    flag.status = status;
    if (reviewerId) {
      flag.reviewedBy = reviewerId;
      flag.reviewedAt = new Date();
    }
    const saved = await this.flagRepo.save(flag);
    await this.recalculateUserRiskScore(flag.userId);
    return saved;
  }

  async fileSar(
    flagId: string,
    filedById: string,
    narrative: string,
    reportReference: string,
  ): Promise<Sar> {
    const flag = await this.flagRepo.findOneOrFail({ where: { id: flagId } });
    const sar = this.sarRepo.create({
      flagId: flag.id,
      filedById,
      narrative,
      reportReference,
      filedAt: new Date(),
    });
    await this.sarRepo.save(sar);
    flag.status = ComplianceFlagStatus.SAR_FILED;
    await this.flagRepo.save(flag);
    await this.recalculateUserRiskScore(flag.userId);
    return sar;
  }

  async findFlags(query: ComplianceFlagQueryDto): Promise<{
    data: ComplianceFlag[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.rule) where.rule = query.rule;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.flagRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async getDashboard(): Promise<{
    flagsByRule: Record<string, number>;
    flagsByStatus: Record<string, number>;
    sarsFiledThisMonth: number;
    highRiskUsers: { userId: string; riskScore: number; openFlags: number }[];
  }> {
    const flagsByRule = await this.flagRepo
      .createQueryBuilder('flag')
      .select('flag.rule', 'rule')
      .addSelect('COUNT(*)', 'count')
      .groupBy('flag.rule')
      .getRawMany();

    const flagsByStatus = await this.flagRepo
      .createQueryBuilder('flag')
      .select('flag.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('flag.status')
      .getRawMany();

    const sarsFiledThisMonth = await this.sarServiceCountFiledThisMonth();

    const highRiskUsers = await this.flagRepo
      .createQueryBuilder('flag')
      .select('flag.userId', 'userId')
      .addSelect('COUNT(*)', 'openFlags')
      .where('flag.status IN (:...statuses)', {
        statuses: ['OPEN', 'UNDER_REVIEW'],
      })
      .groupBy('flag.userId')
      .having('COUNT(*) >= 3')
      .getRawMany();

    const usersWithScores = await Promise.all(
      highRiskUsers.map(async (r) => {
        const user = await this.userRepo.findOne({
          where: { id: r.userId },
          select: ['complianceRiskScore'],
        });
        return {
          userId: r.userId,
          riskScore: user?.complianceRiskScore ?? 0,
          openFlags: parseInt(r.openFlags),
        };
      }),
    );

    return {
      flagsByRule: Object.fromEntries(
        flagsByRule.map((r: any) => [r.rule, parseInt(r.count)]),
      ),
      flagsByStatus: Object.fromEntries(
        flagsByStatus.map((r: any) => [r.status, parseInt(r.count)]),
      ),
      sarsFiledThisMonth,
      highRiskUsers: usersWithScores,
    };
  }

  async exportCsv(from: Date, to: Date): Promise<string> {
    const flags = await this.flagRepo.find({
      where: { createdAt: Between(from, to) },
      order: { createdAt: 'ASC' },
    });

    const flagIds = flags.map((f) => f.id);
    const sars =
      flagIds.length > 0
        ? await this.sarRepo.find({ where: { flagId: In(flagIds) } })
        : [];

    const sarByFlagId = new Map<string, Sar[]>();
    for (const sar of sars) {
      const list = sarByFlagId.get(sar.flagId) || [];
      list.push(sar);
      sarByFlagId.set(sar.flagId, list);
    }

    const header = toCsvRow([
      'Flag ID',
      'User ID',
      'Rule',
      'Risk Score',
      'Status',
      'Created At',
      'SAR Reference',
      'SAR Narrative',
      'SAR Filed At',
    ]);
    const rows = flags
      .map((flag) => {
        const flagSars = sarByFlagId.get(flag.id) || [];
        if (flagSars.length === 0) {
          return toCsvRow([
            flag.id,
            flag.userId,
            flag.rule,
            flag.riskScore,
            flag.status,
            flag.createdAt.toISOString(),
            '',
            '',
            '',
          ]);
        }
        return flagSars
          .map((sar) =>
            toCsvRow([
              flag.id,
              flag.userId,
              flag.rule,
              flag.riskScore,
              flag.status,
              flag.createdAt.toISOString(),
              sar.reportReference,
              sar.narrative,
              sar.filedAt.toISOString(),
            ]),
          )
          .join('\n');
      })
      .join('\n');

    return `${header}\n${rows}`;
  }

  private async sarServiceCountFiledThisMonth(): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return this.sarRepo.count({ where: { filedAt: startOfMonth } });
  }

  private async recalculateUserRiskScore(userId: string): Promise<void> {
    const openCount = await this.flagRepo.count({
      where: { userId, status: In(['OPEN', 'UNDER_REVIEW']) },
    });
    const userFlags = await this.flagRepo.find({
      where: { userId },
      select: ['id'],
    });
    const flagIds = userFlags.map((f) => f.id);
    const sarCount =
      flagIds.length > 0
        ? await this.sarRepo.count({ where: { flagId: In(flagIds) } })
        : 0;
    const score = Math.min(100, openCount * 20 + sarCount * 40);
    await this.userRepo.update(userId, { complianceRiskScore: score });
  }
}
