import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateFeatureFlagsTable1782382000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'feature_flags',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'key',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isEnabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'rolloutPercent',
            type: 'int',
            default: 0,
          },
          {
            name: 'targetUserIds',
            type: 'uuid',
            isArray: true,
            isNullable: true,
          },
          {
            name: 'environments',
            type: 'varchar',
            isArray: true,
            default: "'{}'",
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('feature_flags');
  }
}
