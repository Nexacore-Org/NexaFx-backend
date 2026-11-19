import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenFamily20261119000000
  implements MigrationInterface
{
  name = 'AddRefreshTokenFamily20261119000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('refresh_tokens'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "familyId" uuid`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "familyId" = "id" WHERE "familyId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ALTER COLUMN "familyId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_familyId" ON "refresh_tokens" ("familyId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('refresh_tokens'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_refresh_tokens_familyId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "familyId"`,
    );
  }
}
