import { getMetadataArgsStorage } from 'typeorm';
import { GoalPeriod, SpendingGoal } from './spending-goal.entity';

describe('SpendingGoal entity', () => {
  const columns = () =>
    getMetadataArgsStorage().columns.filter((c) => c.target === SpendingGoal);
  const column = (name: string) =>
    columns().find((c) => c.propertyName === name);

  it('maps to the spending_goals table', () => {
    const table = getMetadataArgsStorage().tables.find(
      (t) => t.target === SpendingGoal,
    );
    expect(table?.name).toBe('spending_goals');
  });

  it('only supports a MONTHLY period', () => {
    expect(Object.values(GoalPeriod)).toEqual(['MONTHLY']);
  });

  it('stores targetAmount as a high-precision numeric', () => {
    expect(column('targetAmount')?.options).toEqual(
      expect.objectContaining({ type: 'numeric', precision: 20, scale: 8 }),
    );
  });

  it('allows categoryId to be null (goal across all categories)', () => {
    expect(column('categoryId')?.options).toEqual(
      expect.objectContaining({ type: 'uuid', nullable: true }),
    );
    expect(column('userId')?.options.nullable).toBeFalsy();
  });

  it('defaults period to MONTHLY and isActive to true', () => {
    expect(column('period')?.options.default).toBe(GoalPeriod.MONTHLY);
    expect(column('isActive')?.options.default).toBe(true);
  });

  it('bounds name and currency lengths', () => {
    expect(column('name')?.options.length).toBe(100);
    expect(column('currency')?.options.length).toBe(10);
  });
});
