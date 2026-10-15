import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `kyc_screenings.status` needs an ERROR value: when the primary screening
 * provider is unreachable (or the local OFAC list has never synced) the result
 * must not be persisted as CLEAR.
 */
export class AddErrorToScreeningStatus1785000000100
  implements MigrationInterface
{
  name = 'AddErrorToScreeningStatus1785000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."kyc_screenings_status_enum" ADD VALUE IF NOT EXISTS 'ERROR'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot remove a value from an enum type; ERROR rows would have
    // to be re-labelled in a separate data migration first.
  }
}
