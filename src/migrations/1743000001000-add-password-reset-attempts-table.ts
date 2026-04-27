import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddPasswordResetAttemptsTable1743000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'password_reset_attempts',
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
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
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

    await queryRunner.createIndex(
      'password_reset_attempts',
      new TableIndex({
        name: 'IDX_password_reset_attempts_email_createdAt',
        columnNames: ['email', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'password_reset_attempts',
      'IDX_password_reset_attempts_email_createdAt',
    );
    await queryRunner.dropTable('password_reset_attempts');
  }
}
