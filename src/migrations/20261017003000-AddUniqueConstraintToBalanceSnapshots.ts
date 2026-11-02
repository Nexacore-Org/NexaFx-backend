import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintToBalanceSnapshots20261017003000
  implements MigrationInterface
{
  name = 'AddUniqueConstraintToBalanceSnapshots20261017003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('balance_snapshots')) {
      // 1. Deduplicate existing rows keeping the latest row for each (user_id, snapshot_date)
      await queryRunner.query(`
        DELETE FROM "balance_snapshots" b1
        USING "balance_snapshots" b2
        WHERE b1."user_id" = b2."user_id"
          AND b1."snapshot_date" = b2."snapshot_date"
          AND (b1."created_at" < b2."created_at" OR (b1."created_at" = b2."created_at" AND b1."id" < b2."id"));
      `);

      // 2. Add UNIQUE constraint on (user_id, snapshot_date)
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'UQ_balance_snapshots_user_snapshot_date'
          ) THEN
            ALTER TABLE "balance_snapshots"
            ADD CONSTRAINT "UQ_balance_snapshots_user_snapshot_date" UNIQUE ("user_id", "snapshot_date");
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('balance_snapshots')) {
      await queryRunner.query(`
        ALTER TABLE "balance_snapshots"
        DROP CONSTRAINT IF EXISTS "UQ_balance_snapshots_user_snapshot_date";
      `);
    }
  }
}
