import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Not } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  SavingsRecommendation,
  RecommendationType,
} from './entities/savings-recommendation.entity';

@Injectable()
export class SavingsRecommendationsService {
  private readonly logger = new Logger(SavingsRecommendationsService.name);

  constructor(
    @InjectRepository(SavingsRecommendation)
    private readonly recommendationRepo: Repository<SavingsRecommendation>,
  ) {}

  @Cron('0 8 * * 1')
  async weeklyRecommendation(): Promise<void> {
    this.logger.log('Running weekly savings recommendation analysis');
    // In production this would iterate over active users and run all 4 analyses.
    // Individual analysis methods are exported for direct use.
  }

  async analyzeVaultContribution(user: { id: string; avgDailyBalanceXlm?: number }): Promise<SavingsRecommendation | null> {
    const avgBalance = user.avgDailyBalanceXlm ?? 0;
    if (avgBalance <= 500) return null;

    const potentialSavings = (avgBalance * 0.2).toFixed(8);

    const rec = this.recommendationRepo.create({
      userId: user.id,
      type: RecommendationType.VAULT_CONTRIBUTION,
      title: 'Move excess balance to a Vault',
      body: `Your average daily balance is ${avgBalance} XLM. Consider vaulting 20% (${potentialSavings} XLM) to earn yield.`,
      potentialSavingsXlm: potentialSavings,
      actionDeepLink: `/vaults/deposit?amount=${potentialSavings}`,
      generatedAt: new Date(),
      expiresAt: this.defaultExpiry(),
    });
    return this.recommendationRepo.save(rec);
  }

  async analyzeRecurringSetup(user: { id: string }): Promise<SavingsRecommendation | null> {
    // Placeholder: would query Transaction repo for 3+ txns to same recipient
    // in 3+ consecutive months. Returns null if criteria not met.
    return null;
  }

  async analyzeVaultDuration(user: { id: string }): Promise<SavingsRecommendation | null> {
    // Placeholder: would check if user has 30-day vault but infrequent sends,
    // then suggest upgrading to 90-day for better yield.
    return null;
  }

  async analyzeTopupReduction(user: { id: string }): Promise<SavingsRecommendation | null> {
    // Placeholder: would check auto-topup count > 5 last month,
    // then suggest increasing threshold.
    return null;
  }

  async getRecommendations(userId: string): Promise<SavingsRecommendation[]> {
    const now = new Date();
    return this.recommendationRepo.find({
      where: {
        userId,
        isActedOn: false,
        expiresAt: LessThan(now),
      },
      order: { generatedAt: 'DESC' },
    });
  }

  async markActedOn(id: string, userId: string): Promise<SavingsRecommendation> {
    const rec = await this.recommendationRepo.findOne({ where: { id, userId } });
    if (!rec) throw new NotFoundException('Recommendation not found');
    rec.isActedOn = true;
    return this.recommendationRepo.save(rec);
  }

  async deleteExpired(): Promise<void> {
    const now = new Date();
    await this.recommendationRepo.delete({ expiresAt: LessThan(now) });
  }

  private defaultExpiry(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d;
  }
}
