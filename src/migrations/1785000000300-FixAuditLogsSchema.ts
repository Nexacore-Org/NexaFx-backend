import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrects audit_logs on databases where the earlier migrations already ran:
 * `impersonatedByAdminId` was declared on the entity but never created (so
 * every audit insert failed), and the performance-index migration tried to
 * index the non-existent "userId" column.
 */
export class FixAuditLogsSchema1785000000300 implements MigrationInterface {
  name = 'FixAuditLogsSchema1785000000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "impersonatedByAdminId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_impersonatedByAdminId" ON "audit_logs" ("impersonatedByAdminId")`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_user_created_action"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor_created_action" ON "audit_logs" ("actorId", "createdAt", "action")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_audit_logs_actor_created_action"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "impersonatedByAdminId"`,
    );
  }
}
