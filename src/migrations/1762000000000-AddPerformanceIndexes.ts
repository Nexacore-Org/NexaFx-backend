import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1762000000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. users: index on createdAt
    await queryRunner.query(`
      CREATE INDEX "IDX_users_createdAt" ON "users" ("createdAt")
    `);

    // 2. transactions: composite index on (userId, createdAt DESC) and index on txHash
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_userId_createdAt" ON "transactions" ("userId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_txHash" ON "transactions" ("txHash")
    `);

    // 3. rate_alerts: composite index on (isActive, triggeredAt)
    await queryRunner.query(`
      CREATE INDEX "IDX_rate_alerts_active_triggered" ON "rate_alerts" ("isActive", "triggeredAt")
    `);

    // 4. audit_logs: composite index on (userId, createdAt, action)
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_user_created_action" ON "audit_logs" ("userId", "createdAt", "action")
    `);

    // 5. kyc_records: composite index on (userId, status)
    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_records_user_status" ON "kyc_records" ("userId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_records_user_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_user_created_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rate_alerts_active_triggered"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_txHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_createdAt"`);
  }
}
