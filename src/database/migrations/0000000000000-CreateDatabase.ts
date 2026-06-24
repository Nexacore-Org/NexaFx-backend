import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDatabase0000000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // baseline migration for initial database setup
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // no rollback action for baseline migration
  }
}
