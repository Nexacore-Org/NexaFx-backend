import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

export class CreateIdempotencyRecordsTable1777307328470 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: 'idempotency_records',
            columns: [
                {
                    name: 'id',
                    type: 'uuid',
                    isPrimary: true,
                    generationStrategy: 'uuid',
                },
                {
                    name: 'key',
                    type: 'varchar',
                    length: '255',
                },
                {
                    name: 'userId',
                    type: 'uuid',
                },
                {
                    name: 'endpoint',
                    type: 'varchar',
                    length: '255',
                },
                {
                    name: 'requestHash',
                    type: 'char',
                    length: '64',
                },
                {
                    name: 'responseStatus',
                    type: 'int',
                },
                {
                    name: 'responseBody',
                    type: 'jsonb',
                },
                {
                    name: 'createdAt',
                    type: 'timestamp with time zone',
                },
                {
                    name: 'expiresAt',
                    type: 'timestamp with time zone',
                },
            ],
        }), true);

        // Create unique index on (key, userId)
        await queryRunner.createIndex('idempotency_records', new TableIndex({
            name: 'IDX_idempotency_records_key_userId_unique',
            columnNames: ['key', 'userId'],
            isUnique: true,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('idempotency_records');
    }
}