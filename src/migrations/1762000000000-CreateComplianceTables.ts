import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComplianceTables1762000000000 implements MigrationInterface {
  name = 'CreateComplianceTables1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if tables already exist (synchronize may have created them)
    if (await queryRunner.hasTable('compliance_flags')) return;

    await queryRunner.query(`
      CREATE TABLE "compliance_flags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "transactionId" uuid,
        "rule" character varying NOT NULL,
        "riskScore" integer NOT NULL,
        "details" jsonb,
        "status" character varying(30) NOT NULL DEFAULT 'OPEN',
        "reviewedBy" uuid,
        "reviewedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compliance_flags" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_compliance_flags_userId_status" ON "compliance_flags" ("userId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_compliance_flags_rule_createdAt" ON "compliance_flags" ("rule", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_compliance_flags_userId" ON "compliance_flags" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_compliance_flags_transactionId" ON "compliance_flags" ("transactionId")
    `);

    await queryRunner.query(`
      CREATE TABLE "sars" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "flagId" uuid NOT NULL,
        "filedById" uuid NOT NULL,
        "narrative" text NOT NULL,
        "filedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reportReference" character varying NOT NULL,
        CONSTRAINT "PK_sars" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sars_flagId" ON "sars" ("flagId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sars_filedById" ON "sars" ("filedById")
    `);

    await queryRunner.query(`
      CREATE TABLE "aml_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "largeTxThresholdUsd" decimal(20,2) NOT NULL DEFAULT '10000.00',
        "rapidMovementCount" integer NOT NULL DEFAULT 5,
        "rapidMovementWindowMinutes" integer NOT NULL DEFAULT 60,
        "roundTripWindowMinutes" integer NOT NULL DEFAULT 30,
        "structuringCount" integer NOT NULL DEFAULT 3,
        "structuringWindowHours" integer NOT NULL DEFAULT 24,
        "newAccountLargeTxThresholdUsd" decimal(20,2) NOT NULL DEFAULT '5000.00',
        "newAccountAgeDays" integer NOT NULL DEFAULT 7,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_aml_config" PRIMARY KEY ("id")
      )
    `);

    // Default config row
    await queryRunner.query(`
      INSERT INTO "aml_config" ("id") VALUES (uuid_generate_v4())
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "aml_config"');
    await queryRunner.query('DROP TABLE IF EXISTS "sars"');
    await queryRunner.query('DROP TABLE IF EXISTS "compliance_flags"');
  }
}
