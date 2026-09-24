import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRevenueDashboard1768000000007 implements MigrationInterface {
  name = 'CreateRevenueDashboard1768000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "revenue_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "date" date NOT NULL,
        "totalUsd" numeric(20,8) NOT NULL,
        "breakdown" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_revenue_snapshots_date" UNIQUE ("date")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "revenue_snapshots"`);
  }
}
