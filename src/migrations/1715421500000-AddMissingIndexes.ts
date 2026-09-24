import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes1715421500000 implements MigrationInterface {
  name = 'AddMissingIndexes1715421500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email)`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone ON users (phone)`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_referral_code ON users ("referralCode")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_id ON transactions ("userId")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON transactions (status)`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallets_user_id ON wallets ("userId")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id ON audit_logs ("userId")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyc_user_id ON kyc ("userId")`);
    await queryRunner.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_otps_user_id ON otps ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_email`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_phone`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_referral_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transactions_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wallets_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_kyc_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_otps_user_id`);
  }
}
