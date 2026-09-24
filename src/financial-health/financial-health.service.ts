import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FinancialHealthScore, HealthGrade } from './entities/financial-health-score.entity';
import Decimal from 'decimal.js';

@Injectable()
export class FinancialHealthService {
  private readonly logger = new Logger(FinancialHealthService.name);

  constructor(
    @InjectRepository(FinancialHealthScore)
    private readonly scoreRepo: Repository<FinancialHealthScore>,
    private readonly dataSource: DataSource,
    private readonly notificationService: any, // Injected notification infrastructure
  ) {}

  async getLatestScore(userId: string): Promise<FinancialHealthScore | null> {
    return this.scoreRepo.findOne({
      where: { userId },
      order: { calculatedAt: 'DESC' },
    });
  }

  async getHistory(userId: string, weeks = 12): Promise<FinancialHealthScore[]> {
    return this.scoreRepo.createQueryBuilder('score')
      .where('score.userId = :userId', { userId })
      .orderBy('score.calculatedAt', 'DESC')
      .take(weeks)
      .getMany();
  }

  /**
   * Applies conditional 0.5% dynamic reduction to base interest parameters for high scorers
   */
  async qualifyLoanRateAdjustment(userId: string, baseRate: number): Promise<number> {
    const latest = await this.getLatestScore(userId);
    if (latest && latest.score >= 80) {
      return new Decimal(baseRate).minus('0.005').toNumber(); // Reduce by 0.5%
    }
    return baseRate;
  }

  /**
   * Weekly analytical score generation pass
   * Fires every Monday at 01:00 UTC
   */
  @Cron('0 1 * * 1')
  async runWeeklyEvaluationCron(): Promise<void> {
    this.logger.log('Starting weekly Financial Health Evaluation pipeline loop...');
    
    // Process only active transacting users to keep resources highly optimized
    const activeUsers = await this.dataSource.query(`
      SELECT DISTINCT "userId" FROM transactions WHERE "status" = 'COMPLETED'
    `);

    for (const row of activeUsers) {
      try {
        await this.calculateAndSaveScore(row.userId);
      } catch (err) {
        this.logger.error(`Failed to evaluate score metrics for user ${row.userId}:`, err);
      }
    }
  }

  async calculateAndSaveScore(userId: string): Promise<FinancialHealthScore> {
    const mockTelemetry = await this.gatherUserTelemetry(userId);
    const previous = await this.getLatestScore(userId);
    const prevScoreVal = previous ? previous.score : 0;

    // High-precision signal mapping using Decimal.js
    const savingsRateScore = Math.min(20, new Decimal(mockTelemetry.savingsRate).mul(20).toNumber());
    const spendingConsistencyScore = mockTelemetry.lowSpendingVariance ? 15 : 5;
    
    // Loan tracking logic: 20 base max; subtract 5 per missed window
    const loanRepaymentScore = Math.max(0, 20 - (mockTelemetry.missedPayments * 5));
    
    const diversificationScore = mockTelemetry.currencyCount >= 3 ? 15 : 5;
    const transactionFrequencyScore = (mockTelemetry.txCountMonthly >= 5 && mockTelemetry.txCountMonthly <= 30) ? 10 : 4;
    
    const kycTierScore = mockTelemetry.kycTier === 'ENHANCED' ? 10 : (mockTelemetry.kycTier === 'STANDARD' ? 6 : 3);
    const accountAgeScore = mockTelemetry.accountAgeMonths >= 6 ? 10 : (mockTelemetry.accountAgeMonths >= 3 ? 6 : 3);

    const totalScore = Math.round(
      savingsRateScore + spendingConsistencyScore + loanRepaymentScore + 
      diversificationScore + transactionFrequencyScore + kycTierScore + accountAgeScore
    );

    let grade = HealthGrade.POOR;
    if (totalScore >= 80) grade = HealthGrade.EXCELLENT;
    else if (totalScore >= 60) grade = HealthGrade.GOOD;
    else if (totalScore >= 40) grade = HealthGrade.FAIR;

    // Collect targeted recommendations by ranking components with the largest room for improvement
    const potentialTips = [
      { key: 'savings', score: savingsRateScore, max: 20, text: 'Increase your monthly deposits into vaults or staking to boost your savings rate.' },
      { key: 'loans', score: loanRepaymentScore, max: 20, text: 'Ensure all loan obligations are settled on schedule to rebuild your repayment index.' },
      { key: 'diversify', score: diversificationScore, max: 15, text: 'Hold balances across 3 or more asset types to increase portfolio resilience.' },
      { key: 'spending', score: spendingConsistencyScore, max: 15, text: 'Stabilize your weekly outflow margins to establish reliable credit habits.' }
    ];

    const tips = potentialTips
      .sort((a, b) => (a.score / a.max) - (b.score / b.max))
      .slice(0, 3)
      .map(t => t.text);

    const delta = totalScore - prevScoreVal;

    const healthScore = this.scoreRepo.create({
      userId,
      score: totalScore,
      grade,
      breakdown: {
        savingsRateScore,
        spendingConsistencyScore,
        loanRepaymentScore,
        diversificationScore,
        transactionFrequencyScore,
        kycTierScore,
        accountAgeScore
      },
      tips,
      previousScore: prevScoreVal,
      scoreDelta: delta
    });

    const saved = await this.scoreRepo.save(healthScore);

    // Trigger proactive alert dispatches when score shifts break the 10-point threshold boundary
    if (delta > 10) {
      await this.notificationService.send(userId, 'CONGRATULATIONS_FINANCIAL_HEALTH_IMPROVED', { score: totalScore });
    } else if (delta < -10) {
      await this.notificationService.send(userId, 'FINANCIAL_HEALTH_DROP_ADVICE', { tips });
    }

    return saved;
  }

  // Simulates or extracts user data profiles via core repositories
  private async gatherUserTelemetry(userId: string) {
    return {
      savingsRate: 0.15, // 15% of income goes to savings
      lowSpendingVariance: true,
      missedPayments: 0,
      currencyCount: 3,
      txCountMonthly: 12,
      kycTier: 'STANDARD',
      accountAgeMonths: 7
    };
  }
}