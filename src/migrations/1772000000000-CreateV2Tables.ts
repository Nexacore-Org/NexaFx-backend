import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateV2Tables1772000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create activity_feed_items table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_feed_items" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL,
        "type" varchar(50) NOT NULL,
        "referenceId" varchar(255) NULL,
        "referenceType" varchar(255) NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_feed_items" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_userId" ON "activity_feed_items" ("userId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_type" ON "activity_feed_items" ("type");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_createdAt" ON "activity_feed_items" ("createdAt");`);

    // 2. Create sms_provider_routes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sms_provider_routes" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "countryCode" varchar(10) NOT NULL,
        "providerName" varchar(100) NOT NULL,
        "priority" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sms_provider_routes" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sms_provider_routes_countryCode" ON "sms_provider_routes" ("countryCode");`);

    // 3. Create payment_rules table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_rules" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL,
        "name" varchar(100) NOT NULL,
        "triggerType" varchar(50) NOT NULL,
        "triggerCondition" jsonb NOT NULL,
        "actionType" varchar(50) NOT NULL,
        "actionParameters" jsonb NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "lastEvaluatedAt" TIMESTAMP WITH TIME ZONE NULL,
        "lastTriggeredAt" TIMESTAMP WITH TIME ZONE NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_rules" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_rules_userId" ON "payment_rules" ("userId");`);

    // 4. Create kyc_doc_verification_results table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kyc_doc_verification_results" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "kycApplicationId" UUID NOT NULL,
        "documentType" varchar(100) NOT NULL,
        "confidenceScore" numeric(5,2) NOT NULL,
        "faceMatchScore" numeric(5,2) NOT NULL,
        "decision" varchar(50) NOT NULL,
        "reason" text NULL,
        "extractedFields" jsonb NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_doc_verification_results" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kyc_doc_verification_results_kycApplicationId" UNIQUE ("kycApplicationId")
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc_doc_verification_results";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_rules";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_provider_routes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_feed_items";`);
  }
}
