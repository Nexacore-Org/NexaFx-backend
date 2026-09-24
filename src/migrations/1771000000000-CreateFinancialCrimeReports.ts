import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFinancialCrimeReports1771000000000
  implements MigrationInterface
{
  name = 'CreateFinancialCrimeReports1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // synchronize may already have created the table in non-production envs.
    if (await queryRunner.hasTable('financial_crime_reports')) return;

    await queryRunner.query(`
      CREATE TABLE "financial_crime_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sarId" uuid NOT NULL,
        "format" character varying(20) NOT NULL,
        "xmlContent" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "submittedAt" TIMESTAMP,
        "submissionReference" character varying(255),
        "generatedById" uuid,
        "submittedById" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_crime_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_financial_crime_reports_sar"
          FOREIGN KEY ("sarId") REFERENCES "sars"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_financial_crime_reports_sarId"
        ON "financial_crime_reports" ("sarId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_financial_crime_reports_status_createdAt"
        ON "financial_crime_reports" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "financial_crime_reports" CASCADE',
    );
  }
}
