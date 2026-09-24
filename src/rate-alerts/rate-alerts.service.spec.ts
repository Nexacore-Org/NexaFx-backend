import { RateAlertCondition } from './entities/rate-alert.entity';
import Decimal from 'decimal.js';

// Isolated unit tests for the Decimal comparison logic (issue #794)
describe('RateAlertsService — Decimal comparison edge cases', () => {
  function shouldTrigger(
    condition: RateAlertCondition,
    currentRate: string,
    targetRate: string,
  ): boolean {
    const current = new Decimal(currentRate);
    const target = new Decimal(targetRate);
    return condition === RateAlertCondition.ABOVE
      ? current.greaterThanOrEqualTo(target)
      : current.lessThanOrEqualTo(target);
  }

  it('ABOVE alert triggers when currentRate=1500 and targetRate=9', () => {
    expect(shouldTrigger(RateAlertCondition.ABOVE, '1500', '9')).toBe(true);
  });

  it('ABOVE alert triggers when currentRate=0.6 and targetRate=0.5', () => {
    expect(shouldTrigger(RateAlertCondition.ABOVE, '0.6', '0.5')).toBe(true);
  });

  it('ABOVE alert does NOT trigger when currentRate=8 and targetRate=9', () => {
    expect(shouldTrigger(RateAlertCondition.ABOVE, '8', '9')).toBe(false);
  });

  it('BELOW alert triggers when currentRate=5 and targetRate=9', () => {
    expect(shouldTrigger(RateAlertCondition.BELOW, '5', '9')).toBe(true);
  });

  it('string lexicographic trap: "1500" > "999" is false but Decimal is true', () => {
    // Demonstrates the bug: native JS string comparison would give wrong result
    expect('1500' > '999').toBe(false); // the bug
    expect(new Decimal('1500').greaterThan(new Decimal('999'))).toBe(true); // the fix
  });
});
