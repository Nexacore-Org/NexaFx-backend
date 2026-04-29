import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateLedgerEntriesAndBackfill1780000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TYPE "public"."ledger_entries_account_type_enum" AS ENUM('USER', 'PLATFORM_ASSET', 'PLATFORM_LIABILITY', 'FEE_REVENUE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ledger_entries_direction_enum" AS ENUM('DEBIT', 'CREDIT')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'ledger_entries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'transactionId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'accountType',
            type: 'enum',
            enumName: 'ledger_entries_account_type_enum',
            enum: ['USER', 'PLATFORM_ASSET', 'PLATFORM_LIABILITY', 'FEE_REVENUE'],
            isNullable: false,
          },
          {
            name: 'direction',
            type: 'enum',
            enumName: 'ledger_entries_direction_enum',
            enum: ['DEBIT', 'CREDIT'],
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
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'ledger_entries',
      new TableForeignKey({
        columnNames: ['transactionId'],
        referencedTableName: 'transactions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndices('ledger_entries', [
      new TableIndex({
        name: 'IDX_ledger_entries_currency_direction',
        columnNames: ['currency', 'direction'],
      }),
      new TableIndex({
        name: 'IDX_ledger_entries_transactionId',
        columnNames: ['transactionId'],
      }),
    ]);

    await queryRunner.query(`
      INSERT INTO "ledger_entries" ("id", "transactionId", "accountType", "direction", "amount", "currency", "createdAt")
      SELECT uuid_generate_v4(), t."id", 'USER', 'CREDIT', t."amount", t."currency", COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'DEPOSIT'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'PLATFORM_LIABILITY', 'DEBIT', t."amount", t."currency", COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'DEPOSIT'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'USER', 'DEBIT', t."amount", t."currency", COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'WITHDRAW'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'PLATFORM_ASSET', 'CREDIT', t."amount", t."currency", COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'WITHDRAW'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'USER', 'DEBIT', t."amount", t."currency", COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'SWAP'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'PLATFORM_ASSET', 'CREDIT', t."amount", t."currency", COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'SWAP'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'PLATFORM_ASSET', 'DEBIT', COALESCE(t."toAmount", t."amount"), COALESCE(t."toCurrency", t."currency"), COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'SWAP'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'USER', 'CREDIT', COALESCE(t."toAmount", t."amount"), COALESCE(t."toCurrency", t."currency"), COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'SWAP'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'FEE_REVENUE', 'DEBIT', COALESCE(t."feeAmount", '0'), COALESCE(t."feeCurrency", t."currency"), COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'SWAP'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
      UNION ALL
      SELECT uuid_generate_v4(), t."id", 'PLATFORM_ASSET', 'CREDIT', COALESCE(t."feeAmount", '0'), COALESCE(t."feeCurrency", t."currency"), COALESCE(t."createdAt", NOW())
      FROM "transactions" t
      WHERE t."type" = 'SWAP'
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_entries" le WHERE le."transactionId" = t."id"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ledger_entries', true);
    await queryRunner.query(`DROP TYPE "public"."ledger_entries_direction_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ledger_entries_account_type_enum"`);
  }
}