import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the missing `complianceRiskScore` column to the `users` table (#1497).
 *
 * `User` declares `@Column({ type: 'int', default: 0 }) complianceRiskScore`
 * and `ComplianceFlagService` reads and writes it, but no migration previously
 * created the column on `users`.
 */
export class AddUsersComplianceRiskScore20261018001000 implements MigrationInterface {
  name = 'AddUsersComplianceRiskScore20261018001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "complianceRiskScore" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "complianceRiskScore"`,
    );
  }
}
