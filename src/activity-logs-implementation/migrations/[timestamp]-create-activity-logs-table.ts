// **migrations/[timestamp]-create-activity-logs-table.ts**

import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateActivityLogsTable1651234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'activity_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'action',
            type: 'varchar',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_ACTIVITY_LOGS_USER_ID',
            columnNames: ['user_id'],
          },
          {
            name: 'IDX_ACTIVITY_LOGS_ACTION',
            columnNames: ['action'],
          },
          {
            name: 'IDX_ACTIVITY_LOGS_CREATED_AT',
            columnNames: ['created_at'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('activity_logs');
  }
}