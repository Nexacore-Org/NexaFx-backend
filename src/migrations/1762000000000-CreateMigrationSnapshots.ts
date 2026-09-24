import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the migration_snapshots table used to track pg_dump snapshots
 * taken before every migration run.
 *
 * This migration is wrapped in an explicit transaction so it can be safely
 * reverted if any step fails.
 */
export class CreateMigrationSnapshots1762000000000
  implements MigrationInterface
{
  name = 'CreateMigrationSnapshots1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`
        CREATE TYPE "public"."migration_snapshots_status_enum" AS ENUM(
          'PENDING',
          'APPLIED',
          'ROLLED_BACK'
        )
      `);

      await queryRunner.query(`
        CREATE TABLE "migration_snapshots" (
          "id"             uuid         NOT NULL DEFAULT uuid_generate_v4(),
          "environment"    varchar(50)  NOT NULL,
          "snapshotKey"    varchar(500) NOT NULL,
          "migrationCount" integer      NOT NULL,
          "status"         "public"."migration_snapshots_status_enum"
                           NOT NULL DEFAULT 'PENDING',
          "appliedAt"      TIMESTAMP WITH TIME ZONE,
          "rolledBackAt"   TIMESTAMP WITH TIME ZONE,
          "takenAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_migration_snapshots_id" PRIMARY KEY ("id")
        )
      `);

      await queryRunner.query(`
        CREATE INDEX "IDX_migration_snapshots_environment"
          ON "migration_snapshots" ("environment")
      `);

      await queryRunner.query(`
        CREATE INDEX "IDX_migration_snapshots_status"
          ON "migration_snapshots" ("status")
      `);

      await queryRunner.query(`
        CREATE INDEX "IDX_migration_snapshots_takenAt"
          ON "migration_snapshots" ("takenAt")
      `);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        'DROP INDEX IF EXISTS "IDX_migration_snapshots_takenAt"',
      );
      await queryRunner.query(
        'DROP INDEX IF EXISTS "IDX_migration_snapshots_status"',
      );
      await queryRunner.query(
        'DROP INDEX IF EXISTS "IDX_migration_snapshots_environment"',
      );
      await queryRunner.query('DROP TABLE IF EXISTS "migration_snapshots"');
      await queryRunner.query(
        'DROP TYPE IF EXISTS "public"."migration_snapshots_status_enum"',
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}
