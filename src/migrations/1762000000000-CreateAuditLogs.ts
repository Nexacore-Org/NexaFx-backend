import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1762000000000 implements MigrationInterface {
  name = 'CreateAuditLogs1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing table if it exists to clean up
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs" CASCADE');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."audit_logs_status_enum" CASCADE');

    await queryRunner.query(`
      CREATE TYPE "public"."audit_logs_status_enum" AS ENUM(
        'SUCCESS',
        'FAILURE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actorId" uuid,
        "targetId" uuid,
        "action" character varying NOT NULL,
        "resourceType" character varying NOT NULL,
        "resourceId" uuid,
        "ipAddress" character varying,
        "userAgent" character varying,
        "status" "public"."audit_logs_status_enum" NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "isSensitive" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `);

    // Add indexes for optimization
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_actorId" ON "audit_logs" ("actorId")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_resourceType" ON "audit_logs" ("resourceType")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_logs"');
    await queryRunner.query('DROP TYPE "public"."audit_logs_status_enum"');
  }
}
