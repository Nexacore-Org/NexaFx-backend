import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAbuseSignals1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'abuse_signals',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'signalType', type: 'varchar', isNullable: false },
          { name: 'score', type: 'float', isNullable: false },
          { name: 'evidence', type: 'jsonb', isNullable: true },
          { name: 'resolved', type: 'boolean', default: false },
          { name: 'detectedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('abuse_signals');
  }
}