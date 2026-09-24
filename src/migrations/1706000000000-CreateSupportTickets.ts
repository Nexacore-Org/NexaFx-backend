import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSupportTickets1706000000000 implements MigrationInterface {
  name = 'CreateSupportTickets1706000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sequence for sequential ticket numbers
    await queryRunner.query('CREATE SEQUENCE ticket_number_seq START WITH 1');

    // Create support_tickets table
    await queryRunner.createTable(
      new Table({
        name: 'support_tickets',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'ticketNumber',
            type: 'varchar',
            isUnique: true,
            default: `\'TKT-\' || lpad(nextval(\'ticket_number_seq\')::text, 5, \'0\')`,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'assignedTo',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'subject',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['TRANSACTION', 'KYC', 'ACCOUNT', 'TECHNICAL', 'OTHER'],
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['OPEN', 'IN_PROGRESS', 'PENDING_USER', 'RESOLVED', 'CLOSED'],
            default: "'OPEN'",
          },
          {
            name: 'slaDeadlineAt',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'isSlaBreached',
            type: 'boolean',
            default: false,
          },
          {
            name: 'resolvedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'closedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create ticket_messages table
    await queryRunner.createTable(
      new Table({
        name: 'ticket_messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'ticketId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'authorId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'authorRole',
            type: 'enum',
            enum: ['USER', 'ADMIN', 'SYSTEM'],
          },
          {
            name: 'body',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'attachmentKeys',
            type: 'text',
            isArray: true,
            isNullable: true,
          },
          {
            name: 'isInternal',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create foreign keys
    await queryRunner.createForeignKeys('support_tickets', [
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['assignedTo'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createForeignKeys('ticket_messages', [
      new TableForeignKey({
        columnNames: ['ticketId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'support_tickets',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['authorId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    ]);

    // Create indices
    await queryRunner.createIndices('support_tickets', [
      new TableIndex({
        name: 'IDX_support_tickets_userId',
        columnNames: ['userId'],
      }),
      new TableIndex({
        name: 'IDX_support_tickets_assignedTo',
        columnNames: ['assignedTo'],
      }),
      new TableIndex({
        name: 'IDX_support_tickets_ticketNumber',
        columnNames: ['ticketNumber'],
      }),
    ]);

    await queryRunner.createIndices('ticket_messages', [
      new TableIndex({
        name: 'IDX_ticket_messages_ticketId',
        columnNames: ['ticketId'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop ticket_messages table and its enums
    await queryRunner.dropTable('ticket_messages');
    await queryRunner.query('DROP TYPE IF EXISTS "ticket_messages_authorrole_enum"');

    // Drop support_tickets table and its enums
    await queryRunner.dropTable('support_tickets');
    await queryRunner.query('DROP TYPE IF EXISTS "support_tickets_category_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "support_tickets_priority_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "support_tickets_status_enum"');

    // Drop ticket number sequence
    await queryRunner.query('DROP SEQUENCE IF EXISTS ticket_number_seq');
  }
}
