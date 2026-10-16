import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

export class AddMissingTablesAndColumns1765000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create referrals table
    await queryRunner.createTable(
      new Table({
        name: 'referrals',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'referrerId', type: 'uuid', isNullable: false },
          { name: 'refereeId', type: 'uuid', isUnique: true, isNullable: false },
          { name: 'status', type: 'varchar', default: "'PENDING'" },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    // 2. Create activity_feed_items table
    await queryRunner.createTable(
      new Table({
        name: 'activity_feed_items',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'type', type: 'varchar', isNullable: false },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'activity_feed_items',
      new TableIndex({
        name: 'IDX_ACTIVITY_USER_CREATED_ID',
        columnNames: ['userId', 'createdAt', 'id'],
      }),
    );

    // 3. Create custom_report_definitions table
    await queryRunner.createTable(
      new Table({
        name: 'custom_report_definitions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'entity', type: 'varchar', isNullable: false },
          { name: 'filters', type: 'jsonb', isNullable: true },
          { name: 'columns', type: 'text', array: true, isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    // 4. Add missing columns to rate_alerts table
    await queryRunner.addColumns('rate_alerts', [
      new TableColumn({
        name: 'alertMode',
        type: 'varchar',
        default: "'absolute'",
        isNullable: false,
      }),
      new TableColumn({
        name: 'percentThreshold',
        type: 'numeric',
        precision: 5,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'baselineRate',
        type: 'numeric',
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert changes in reverse order
    await queryRunner.dropColumns('rate_alerts', ['alertMode', 'percentThreshold', 'baselineRate']);
    await queryRunner.dropTable('custom_report_definitions');
    await queryRunner.dropIndex('activity_feed_items', 'IDX_ACTIVITY_USER_CREATED_ID');
    await queryRunner.dropTable('activity_feed_items');
    await queryRunner.dropTable('referrals');
  }
}