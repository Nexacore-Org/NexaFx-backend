import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateConditionalPayments1730000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'conditional_payments',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'conditionType', type: 'varchar', isNullable: false },
          { name: 'conditionParams', type: 'jsonb', isNullable: false },
          { name: 'actionParams', type: 'jsonb', isNullable: false },
          { name: 'status', type: 'varchar', default: "'PENDING'", isNullable: false },
          { name: 'expiresAt', type: 'timestamp', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('conditional_payments');
  }
}