import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityFeedCompositeIndex20261018000000 implements MigrationInterface {
  name = 'AddActivityFeedCompositeIndex20261018000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('activity_feed_items')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_user_created_id_desc" ON "activity_feed_items" ("userId", "createdAt" DESC, "id" DESC)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_activity_feed_items_user_created_id_desc"`,
    );
  }
}
