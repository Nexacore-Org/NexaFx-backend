import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddBlockchainTables1759501683222 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create UUID extension if not exists
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        // Create blockchain_wallets table
        await queryRunner.createTable(
            new Table({
                name: 'blockchain_wallets',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'publicKey',
                        type: 'varchar',
                        isUnique: true,
                    },
                    {
                        name: 'encryptedSecret',
                        type: 'text',
                    },
                    {
                        name: 'label',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'userId',
                        type: 'uuid',
                    },
                    {
                        name: 'isActive',
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
                    },
                ],
            }),
            true,
        );

        // Create contract_transactions table
        await queryRunner.createTable(
            new Table({
                name: 'contract_transactions',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'txHash',
                        type: 'varchar',
                        isUnique: true,
                    },
                    {
                        name: 'type',
                        type: 'enum',
                        enum: ['TRANSFER', 'CONTRACT_CALL', 'DEPLOY', 'CREATE_WALLET'],
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['PENDING', 'SUCCESS', 'FAILED', 'PROCESSING'],
                        default: "'PENDING'",
                    },
                    {
                        name: 'userId',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'fromAddress',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'toAddress',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'amount',
                        type: 'decimal',
                        precision: 20,
                        scale: 7,
                        isNullable: true,
                    },
                    {
                        name: 'assetCode',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'memo',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'metadata',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'errorMessage',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'retryCount',
                        type: 'int',
                        default: 0,
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
                    },
                    {
                        name: 'confirmedAt',
                        type: 'timestamp',
                        isNullable: true,
                    },
                ],
            }),
            true,
        );

        // Create indices for contract_transactions
        await queryRunner.createIndex(
            'contract_transactions',
            new TableIndex({
                name: 'IDX_contract_transactions_txHash',
                columnNames: ['txHash'],
            }),
        );

        await queryRunner.createIndex(
            'contract_transactions',
            new TableIndex({
                name: 'IDX_contract_transactions_status',
                columnNames: ['status'],
            }),
        );

        await queryRunner.createIndex(
            'contract_transactions',
            new TableIndex({
                name: 'IDX_contract_transactions_userId',
                columnNames: ['userId'],
            }),
        );

        // Add foreign key for blockchain_wallets (assuming users table exists)
        await queryRunner.createForeignKey(
            'blockchain_wallets',
            new TableForeignKey({
                columnNames: ['userId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'users',
                onDelete: 'CASCADE',
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key first
        const table = await queryRunner.getTable('blockchain_wallets');
        const foreignKey = table?.foreignKeys.find(
            fk => fk.columnNames.indexOf('userId') !== -1,
        );
        if (foreignKey) {
            await queryRunner.dropForeignKey('blockchain_wallets', foreignKey);
        }

        // Drop indices
        await queryRunner.dropIndex('contract_transactions', 'IDX_contract_transactions_txHash');
        await queryRunner.dropIndex('contract_transactions', 'IDX_contract_transactions_status');
        await queryRunner.dropIndex('contract_transactions', 'IDX_contract_transactions_userId');

        // Drop tables
        await queryRunner.dropTable('contract_transactions');
        await queryRunner.dropTable('blockchain_wallets');
    }
}