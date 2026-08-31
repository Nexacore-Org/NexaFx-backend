import {
  RevenueSnapshot,
  RevenuePeriodType,
} from './revenue-snapshot.entity';

describe('RevenueSnapshot Entity', () => {
  it('should instantiate correctly with valid fields', () => {
    const snapshot = new RevenueSnapshot();
    snapshot.id = 'uuid-snap-1';
    snapshot.periodType = RevenuePeriodType.DAILY;
    snapshot.periodStart = new Date('2026-08-01T00:00:00Z');
    snapshot.periodEnd = new Date('2026-08-01T23:59:59Z');
    snapshot.totalTransactions = 45;
    snapshot.totalVolumeUsd = '125000.50000000';
    snapshot.totalFeeRevenueUsd = '625.00250000';
    snapshot.feeBreakdown = { SWAP: '500.00000000', WITHDRAW: '125.00250000' };
    snapshot.currency = 'USD';
    snapshot.isFinalized = true;

    expect(snapshot.id).toBe('uuid-snap-1');
    expect(snapshot.periodType).toBe(RevenuePeriodType.DAILY);
    expect(snapshot.totalTransactions).toBe(45);
    expect(snapshot.totalVolumeUsd).toBe('125000.50000000');
    expect(snapshot.totalFeeRevenueUsd).toBe('625.00250000');
    expect(snapshot.isFinalized).toBe(true);
  });

  it('should support all RevenuePeriodType enum values', () => {
    expect(RevenuePeriodType.DAILY).toBe('DAILY');
    expect(RevenuePeriodType.WEEKLY).toBe('WEEKLY');
    expect(RevenuePeriodType.MONTHLY).toBe('MONTHLY');
    expect(RevenuePeriodType.QUARTERLY).toBe('QUARTERLY');
    expect(RevenuePeriodType.ANNUAL).toBe('ANNUAL');
  });
});
