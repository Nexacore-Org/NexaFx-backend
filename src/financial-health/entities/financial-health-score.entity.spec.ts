import {
  FinancialHealthScore,
  HealthGrade,
} from './financial-health-score.entity';

describe('FinancialHealthScore entity', () => {
  it('should define all four health grade variants', () => {
    expect(Object.values(HealthGrade)).toEqual([
      'POOR',
      'FAIR',
      'GOOD',
      'EXCELLENT',
    ]);
  });

  it('should be instantiable with all required fields', () => {
    const score = new FinancialHealthScore();
    score.id = 'uuid-1';
    score.userId = 'user-1';
    score.score = 72;
    score.grade = HealthGrade.GOOD;
    score.breakdown = {
      savingsRateScore: 14,
      spendingConsistencyScore: 15,
      loanRepaymentScore: 20,
      diversificationScore: 5,
      transactionFrequencyScore: 10,
      kycTierScore: 3,
      accountAgeScore: 5,
    };
    score.tips = ['Increase diversification'];
    score.previousScore = 60;
    score.scoreDelta = 12;
    score.calculatedAt = new Date('2026-01-01T00:00:00Z');

    expect(score.userId).toBe('user-1');
    expect(score.score).toBe(72);
    expect(score.grade).toBe(HealthGrade.GOOD);
    expect(score.tips).toHaveLength(1);
    expect(score.previousScore).toBe(60);
    expect(score.scoreDelta).toBe(12);
  });

  it('should default previousScore and scoreDelta to 0', () => {
    const score = new FinancialHealthScore();
    expect(score.previousScore).toBeUndefined();
    expect(score.scoreDelta).toBeUndefined();
  });
});
