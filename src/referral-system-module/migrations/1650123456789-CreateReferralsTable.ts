// migrations/1650123456789-CreateReferralsTable.ts

import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateReferralsTable1650123456789 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create referrals table
    await queryRunner.createTable(
      new Table({
        name: 'referrals',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'referrer_user_id',
            type: 'uuid',
          },
          {
            name: 'referred_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'code',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'active',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'referrals',
      new TableForeignKey({
        columnNames: ['referrer_user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'referrals',
      new TableForeignKey({
        columnNames: ['referred_user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );

    // Add column to users table
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "referred_by_id" uuid NULL`);
    
    // Add foreign key for referred_by_id
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        columnNames: ['referred_by_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const userTable = await queryRunner.getTable('users');
    const referredByForeignKey = userTable.foreignKeys.find(
      fk => fk.columnNames.indexOf('referred_by_id') !== -1,
    );
    await queryRunner.dropForeignKey('users', referredByForeignKey);
    
    // Drop column
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referred_by_id"`);
    
    // Drop referrals table (this will automatically drop its foreign keys)
    await queryRunner.dropTable('referrals');
  }
}