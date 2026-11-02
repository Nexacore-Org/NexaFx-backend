import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEscrowVaultLoanNotificationTypes20261018001000
  implements MigrationInterface
{
  name = 'AddEscrowVaultLoanNotificationTypes20261018001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const newTypes = [
      'ESCROW_CREATED',
      'ESCROW_REFUNDED',
      'VAULT_AUTO_DEPOSIT_SKIPPED',
      'LOAN_APPROVED',
      'LOAN_REJECTED',
      'LOAN_OVERDUE',
      'LOAN_DEFAULTED',
    ];

    for (const value of newTypes) {
      await queryRunner.query(`
        ALTER TYPE "public"."notifications_type_enum"
          ADD VALUE IF NOT EXISTS '${value}'
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'notification_preferences_notificationtype_enum'
          ) THEN
            ALTER TYPE "public"."notification_preferences_notificationtype_enum"
              ADD VALUE IF NOT EXISTS '${value}';
          END IF;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing values from an existing enum type.
  }
}
