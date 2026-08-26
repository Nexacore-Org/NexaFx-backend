import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIndexAdvisoryReports1768000000002
  implements MigrationInterface
{
  name = 'CreateIndexAdvisoryReports1768000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "index_advisory_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "missingIndexes" jsonb NOT NULL DEFAULT '[]',
        "unusedIndexes" jsonb NOT NULL DEFAULT '[]',
        "slowQueries" jsonb NOT NULL DEFAULT '[]',
        "suggestedMigrations" jsonb NOT NULL DEFAULT '[]',
        "hasCriticalFindings" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_index_advisory_reports_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_index_advisory_reports_runAt"
      ON "index_advisory_reports" ("runAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_index_advisory_reports_runAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "index_advisory_reports"`);
  }
}
