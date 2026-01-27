import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateTransactionsTable1706000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['DEPOSIT', 'WITHDRAW'],
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 20,
            scale: 8,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'rate',
            type: 'decimal',
            precision: 20,
            scale: 8,
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'txHash',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'text',
            isNullable: true,
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

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'transactions',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes for better query performance
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_userId" ON "transactions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_status" ON "transactions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_type" ON "transactions" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_currency" ON "transactions" ("currency")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_txHash" ON "transactions" ("txHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_createdAt" ON "transactions" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_transactions_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_txHash"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_currency"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_type"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_status"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_userId"`);

    // Drop foreign key
    const table = await queryRunner.getTable('transactions');
    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    await queryRunner.dropForeignKey('transactions', foreignKey);

    // Drop table
    await queryRunner.dropTable('transactions');
  }
}
