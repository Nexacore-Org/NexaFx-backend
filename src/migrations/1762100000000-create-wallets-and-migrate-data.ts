import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateWalletsAndMigrateData1762100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('wallets');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'wallets',
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
              name: 'publicKey',
              type: 'varchar',
              length: '56',
              isNullable: false,
            },
            {
              name: 'encryptedSecretKey',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'label',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'isDefault',
              type: 'boolean',
              default: false,
              isNullable: false,
            },
            {
              name: 'network',
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
      );

      await queryRunner.createForeignKey(
        'wallets',
        new TableForeignKey({
          columnNames: ['userId'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createIndex(
        'wallets',
        new TableIndex({
          name: 'IDX_wallets_user_publicKey',
          columnNames: ['userId', 'publicKey'],
          isUnique: true,
        }),
      );

      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_wallets_user_default_unique" ON "wallets" ("userId") WHERE "isDefault" = true`,
      );
    }

    const network =
      process.env.STELLAR_NETWORK === 'PUBLIC' ? 'PUBLIC' : 'TESTNET';

    await queryRunner.query(
      `
      INSERT INTO "wallets" ("id", "userId", "publicKey", "encryptedSecretKey", "label", "isDefault", "network", "createdAt")
      SELECT uuid_generate_v4(), u."id", u."walletPublicKey", u."walletSecretKeyEncrypted", 'Primary', true, $1, NOW()
      FROM "users" u
      WHERE NOT EXISTS (SELECT 1 FROM "wallets" w WHERE w."userId" = u."id")
      `,
      [network],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_wallets_user_default_unique"`,
    );
    await queryRunner.dropTable('wallets', true);
  }
}
