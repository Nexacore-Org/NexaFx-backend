import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotesAndTagsToTransactions1720000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add userNote — private, owner-only
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "userNote" text NULL`,
    );

    // Add counterpartyMemo — shared, max 200 chars
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "counterpartyMemo" varchar(200) NULL`,
    );

    // Add tags — PostgreSQL text array
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "tags" text[] NULL`,
    );

    // GIN index on tags array for efficient @> (contains) queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_tags_gin" ON "transactions" USING GIN ("tags")`,
    );

    // B-tree index on counterpartyMemo for ILIKE search performance
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_counterpartyMemo" ON "transactions" ("counterpartyMemo")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_counterpartyMemo"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_tags_gin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "tags"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "counterpartyMemo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "userNote"`,
    );
  }
}
