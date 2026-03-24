import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeNotificationTypeCasingAndAddMissingValues1711300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure the notifications.type enum contains all required values.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notifications_type_enum'
        ) THEN
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'PROJECT';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'MESSAGING';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'CONTRIBUTION';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'INVITATION';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'SWAP_COMPLETED';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'WALLET_UPDATED';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'TRANSACTION_FAILED';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'DEPOSIT_CONFIRMED';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_PROCESSED';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'REFERRAL_REWARDED';
        END IF;
      END
      $$;
    `);

    // One-time normalization for legacy lowercase enum/text values.
    await queryRunner.query(`
      UPDATE "notifications"
      SET "type" = 'SWAP_COMPLETED'
      WHERE "type"::text = 'swap_completed';
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "type" = 'WALLET_UPDATED'
      WHERE "type"::text = 'wallet_updated';
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "type" = 'TRANSACTION_FAILED'
      WHERE "type"::text = 'transaction_failed';
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "type" = 'DEPOSIT_CONFIRMED'
      WHERE "type"::text = 'deposit_confirmed';
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "type" = 'WITHDRAWAL_PROCESSED'
      WHERE "type"::text = 'withdrawal_processed';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op:
    // Postgres enum values cannot be removed safely in-place.
    // Rolling back this migration should be handled by a dedicated enum recreation migration if needed.
    await queryRunner.query('SELECT 1');
  }
}
