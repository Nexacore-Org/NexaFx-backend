// src/migrations/1713652743250-CreateNotificationPreferencesTable.ts
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateNotificationPreferencesTable1713652743250 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notification_preferences',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'notifyOnTx',
            type: 'boolean',
            default: true,
          },
          {
            name: 'notifyOnAnnouncements',
            type: 'boolean',
            default: true,
          },
          {
            name: 'emailEnabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'smsEnabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'pushEnabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'notification_preferences',
      new TableIndex({
        name: 'IDX_NOTIFICATION_PREFERENCES_USER_ID',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification_preferences');
  }
}
