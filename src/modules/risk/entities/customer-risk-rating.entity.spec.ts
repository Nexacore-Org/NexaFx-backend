import {
  CustomerRiskRating,
  RiskLevel,
} from './customer-risk-rating.entity';

describe('CustomerRiskRating Entity', () => {
  it('should instantiate correctly with default properties', () => {
    const rating = new CustomerRiskRating();
    rating.id = 'uuid-1234';
    rating.userId = 'user-5678';
    rating.score = 25.5;
    rating.riskLevel = RiskLevel.LOW;
    rating.factors = { kycTierScore: 10, countryRiskScore: 5 };
    rating.lastEvaluatedAt = new Date();

    expect(rating.id).toBe('uuid-1234');
    expect(rating.userId).toBe('user-5678');
    expect(rating.score).toBe(25.5);
    expect(rating.riskLevel).toBe(RiskLevel.LOW);
    expect(rating.factors.kycTierScore).toBe(10);
    expect(rating.lastEvaluatedAt).toBeInstanceOf(Date);
  });

  it('should contain all expected RiskLevel enum values', () => {
    expect(RiskLevel.LOW).toBe('LOW');
    expect(RiskLevel.MEDIUM).toBe('MEDIUM');
    expect(RiskLevel.HIGH).toBe('HIGH');
    expect(RiskLevel.CRITICAL).toBe('CRITICAL');
  });
});
