import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuditExportTablesAndSchedules1780000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit_log_export_jobs table
    await queryRunner.createTable(
      new Table({
        name: 'audit_log_export_jobs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'adminUserId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enumName: 'export_job_status',
            enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
            default: "'PENDING'",
          },
          {
            name: 'format',
            type: 'enum',
            enumName: 'export_format',
            enum: ['PDF', 'CSV'],
            isNullable: false,
          },
          {
            name: 'filters',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'filename',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'fileSize',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'recordCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'completedAt',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
        indices: [
          new TableIndex({
            columnNames: ['adminUserId'],
          }),
          new TableIndex({
            columnNames: ['status'],
          }),
        ],
      }),
      true,
    );

    // Create audit_log_schedules table
    await queryRunner.createTable(
      new Table({
        name: 'audit_log_schedules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'adminUserId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'adminEmail',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'frequency',
            type: 'enum',
            enumName: 'schedule_frequency',
            enum: ['MONTHLY'],
            default: "'MONTHLY'",
          },
          {
            name: 'lastRun',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'nextRun',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          new TableIndex({
            columnNames: ['adminUserId'],
          }),
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_log_schedules', true);
    await queryRunner.dropTable('audit_log_export_jobs', true);
    await queryRunner.dropEnumType('export_job_status');
    await queryRunner.dropEnumType('export_format');
    await queryRunner.dropEnumType('schedule_frequency');
  }
}
