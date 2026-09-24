import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhookVerifications1784000000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_verifications" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "payloadHash" varchar(64) NOT NULL,
        "signatureHeader" varchar(256) NOT NULL,
        "secretFingerprint" varchar(16) NOT NULL,
        "valid" boolean NOT NULL,
        "reason" varchar(160) NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_verifications" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webhook_verifications_valid_createdAt"
        ON "webhook_verifications" ("valid", "createdAt");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_verifications";`);
  }
}