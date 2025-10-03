import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class AddBlockchainTables1234567890123 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
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

        // Create indices
        await queryRunner.query(
            `CREATE INDEX "IDX_contract_transactions_txHash" ON "contract_transactions" ("txHash")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_contract_transactions_status" ON "contract_transactions" ("status")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_contract_transactions_userId" ON "contract_transactions" ("userId")`,
        );

        // Add foreign key for blockchain_wallets
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
        await queryRunner.dropTable('contract_transactions');
        await queryRunner.dropTable('blockchain_wallets');
    }
}