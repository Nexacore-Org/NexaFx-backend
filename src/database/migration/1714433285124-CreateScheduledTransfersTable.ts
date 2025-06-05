import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateScheduledTransfersTable1714433285124
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'scheduled_transfers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'from_currency',
            type: 'varchar',
          },
          {
            name: 'to_currency',
            type: 'varchar',
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 8,
          },
          {
            name: 'scheduled_at',
            type: 'timestamp',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'executed', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'executed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for faster queries
    await queryRunner.createIndex(
      'scheduled_transfers',
      new TableIndex({
        name: 'IDX_SCHEDULED_TRANSFERS_USER_ID',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'scheduled_transfers',
      new TableIndex({
        name: 'IDX_SCHEDULED_TRANSFERS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'scheduled_transfers',
      new TableIndex({
        name: 'IDX_SCHEDULED_TRANSFERS_SCHEDULED_AT',
        columnNames: ['scheduled_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'scheduled_transfers',
      'IDX_SCHEDULED_TRANSFERS_SCHEDULED_AT',
    );
    await queryRunner.dropIndex(
      'scheduled_transfers',
      'IDX_SCHEDULED_TRANSFERS_STATUS',
    );
    await queryRunner.dropIndex(
      'scheduled_transfers',
      'IDX_SCHEDULED_TRANSFERS_USER_ID',
    );
    await queryRunner.dropTable('scheduled_transfers');
  }
}
