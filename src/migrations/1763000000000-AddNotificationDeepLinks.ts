import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationDeepLinks1763000000000
  implements MigrationInterface
{
  name = 'AddNotificationDeepLinks1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const newTypes = [
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
    ];

    for (const value of newTypes) {
      await queryRunner.query(`
        ALTER TYPE "public"."notifications_type_enum"
          ADD VALUE IF NOT EXISTS '${value}'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values.
    // To roll back, recreate the enum without the new values and
    // update the column type. Omitted here as it requires a full
    // enum swap and is rarely needed in practice.
  }
}
