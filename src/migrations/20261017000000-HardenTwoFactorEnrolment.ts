import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardens two-factor enrolment and verification.
 *
 * - pendingTwoFactorSecret: an enrolment started with POST /two-factor/setup
 *   is stored apart from the active secret, so a half-finished setup (or a
 *   re-setup attempt on a user whose 2FA is already on) cannot overwrite it.
 * - lastTotpStep: the highest accepted TOTP time step, so a code cannot be
 *   replayed inside its ~30s validity window.
 * - twoFactorFailedAttempts / twoFactorLockedUntil: per-user throttling for
 *   TOTP and backup-code verification, which previously had no limit beyond
 *   the global throttle.
 */
export class HardenTwoFactor1220_20261017000000 implements MigrationInterface {
  name = 'HardenTwoFactor1220_20261017000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pendingTwoFactorSecret" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastTotpStep" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorFailedAttempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorLockedUntil" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "pendingTwoFactorSecret"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lastTotpStep"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorFailedAttempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorLockedUntil"`,
    );
  }
}