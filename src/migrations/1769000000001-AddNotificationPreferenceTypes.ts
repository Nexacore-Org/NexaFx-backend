import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationPreferenceTypes1769000000001 implements MigrationInterface {
  name = 'AddNotificationPreferenceTypes1769000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const notificationTypes = [
      'SYSTEM',
      'TRANSACTION',
      'OTP',
      'MESSAGING',
      'CONTRIBUTION',
      'INVITATION',
      'SWAP_COMPLETED',
      'WALLET_UPDATED',
      'TRANSACTION_FAILED',
      'DEPOSIT_CONFIRMED',
      'WITHDRAWAL_PROCESSED',
      'REFERRAL_REWARDED',
      'KYC_APPROVED',
      'KYC_REJECTED',
      'RATE_ALERT_TRIGGERED',
      'ESCROW_FUNDED',
      'ESCROW_RELEASED',
      'ESCROW_DISPUTED',
      'VAULT_MATURITY',
      'SUPPORT_TICKET_UPDATE',
      'SECURITY_ALERT',
      'LOAN_REPAYMENT_DUE',
      'STAKING_UNLOCK',
      'SPENDING_GOAL_WARNING',
    ];

    for (const notificationType of notificationTypes) {
      await queryRunner.query(`
        ALTER TYPE "public"."notification_preferences_notificationtype_enum"
          ADD VALUE IF NOT EXISTS '${notificationType}'
      `);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values.
  }
}
