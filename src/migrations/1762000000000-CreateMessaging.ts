import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMessaging1762000000000 implements MigrationInterface {
  name = 'CreateMessaging1762000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'conversationId',
            type: 'varchar',
          },
          {
            name: 'senderId',
            type: 'uuid',
          },
          {
            name: 'recipientId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'body',
            type: 'text',
          },
          {
            name: 'attachmentKeys',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isRead',
            type: 'boolean',
            default: false,
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['DIRECT', 'BROADCAST'],
            default: `'DIRECT'`,
          },
          {
            name: 'broadcastId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['senderId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['recipientId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'IDX_messages_conversation_created',
        columnNames: ['conversationId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'IDX_messages_recipient_read',
        columnNames: ['recipientId', 'isRead'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'broadcasts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'adminId',
            type: 'uuid',
          },
          {
            name: 'subject',
            type: 'varchar',
          },
          {
            name: 'body',
            type: 'text',
          },
          {
            name: 'targetAudience',
            type: 'enum',
            enum: ['ALL', 'KYC_APPROVED', 'UNVERIFIED', 'SPECIFIC_USERS'],
          },
          {
            name: 'targetUserIds',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['DRAFT', 'SENT'],
            default: `'DRAFT'`,
          },
          {
            name: 'sentAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'recipientCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['adminId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('broadcasts');
    await queryRunner.dropTable('messages');
  }
}
