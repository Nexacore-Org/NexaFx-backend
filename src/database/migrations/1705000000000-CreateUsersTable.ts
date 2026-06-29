import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUsersTable1705000000000 implements MigrationInterface {
  name = 'CreateUsersTable1705000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'firstName',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'lastName',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'password',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'passwordHash',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'refreshTokenHash',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '20',
            isNullable: true,
            isUnique: true,
          },
          {
            name: 'walletPublicKey',
            type: 'varchar',
            length: '56',
          },
          {
            name: 'walletSecretKeyEncrypted',
            type: 'text',
          },
          {
            name: 'twoFactorSecret',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'balances',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'",
          },
          {
            name: 'fcmTokens',
            type: 'jsonb',
            isNullable: true,
            default: "'[]'",
          },
          {
            name: 'referralCode',
            type: 'varchar',
            length: '8',
            isUnique: true,
          },
          {
            name: 'referredBy',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'isVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isEmailVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'kycTier',
            type: 'enum',
            enum: ['UNVERIFIED', 'BASIC', 'ENHANCED', 'FULL'],
            default: "'UNVERIFIED'",
          },
          {
            name: 'isSuspended',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isTwoFactorEnabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'failedLoginAttempts',
            type: 'int',
            default: 0,
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'lockedUntil',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['USER', 'ADMIN', 'SUPER_ADMIN'],
            default: "'USER'",
          },
          {
            name: 'plan',
            type: 'enum',
            enum: ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'],
            default: "'FREE'",
          },
          {
            name: 'balanceLastSyncedAt',
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

    await queryRunner.createIndex(
      'users',
      new TableIndex({ name: 'IDX_users_phone', columnNames: ['phone'] }),
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_referredBy',
        columnNames: ['referredBy'],
      }),
    );
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_walletPublicKey',
        columnNames: ['walletPublicKey'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_users_walletPublicKey');
    await queryRunner.dropIndex('users', 'IDX_users_referredBy');
    await queryRunner.dropIndex('users', 'IDX_users_phone');
    await queryRunner.dropTable('users');
    await queryRunner.query('DROP TYPE IF EXISTS "users_kyctier_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "users_role_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "users_plan_enum"');
  }
}
