import { QueryRunner } from 'typeorm';
import { AddUniqueConstraintToBalanceSnapshots20261017003000 } from './20261017003000-AddUniqueConstraintToBalanceSnapshots';

describe('AddUniqueConstraintToBalanceSnapshots20261017003000', () => {
  let migration: AddUniqueConstraintToBalanceSnapshots20261017003000;
  let queryRunner: jest.Mocked<Pick<QueryRunner, 'hasTable' | 'query'>>;

  beforeEach(() => {
    migration = new AddUniqueConstraintToBalanceSnapshots20261017003000();
    queryRunner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue([]),
    };
  });

  it('runs deduplication and creates unique constraint on up', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    expect(queryRunner.hasTable).toHaveBeenCalledWith('balance_snapshots');
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM "balance_snapshots" b1'),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UQ_balance_snapshots_user_snapshot_date'),
    );
  });

  it('drops unique constraint on down', async () => {
    await migration.down(queryRunner as unknown as QueryRunner);

    expect(queryRunner.hasTable).toHaveBeenCalledWith('balance_snapshots');
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('DROP CONSTRAINT IF EXISTS "UQ_balance_snapshots_user_snapshot_date"'),
    );
  });
});
