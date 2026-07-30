import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHealthReports1768000000018 implements MigrationInterface {
  name = 'CreateHealthReports1768000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "health_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reportDate" date NOT NULL,
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "anomalies" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_health_reports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_health_reports_reportDate" UNIQUE ("reportDate")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "health_reports"`);
  }
}
