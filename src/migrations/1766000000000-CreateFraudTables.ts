import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFraudTables1766000000000 implements MigrationInterface {
  name = 'CreateFraudTables1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'fraud_alerts',
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
            name: 'loginAttemptId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'alertType',
            type: 'enum',
            enum: [
              'IMPOSSIBLE_TRAVEL',
              'HIGH_RISK_COUNTRY',
              'SUSPICIOUS_IP',
              'HIGH_RISK_SCORE',
            ],
            isNullable: false,
          },
          {
            name: 'riskScore',
            type: 'int',
            default: 0,
          },
          {
            name: 'details',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['OPEN', 'REVIEWED', 'DISMISSED'],
            default: `'OPEN'`,
            isNullable: false,
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

    await queryRunner.createTable(
      new Table({
        name: 'login_attempts',
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
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'country',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'city',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'latitude',
            type: 'decimal',
            precision: 10,
            scale: 7,
            isNullable: true,
          },
          {
            name: 'longitude',
            type: 'decimal',
            precision: 10,
            scale: 7,
            isNullable: true,
          },
          {
            name: 'isp',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'riskScore',
            type: 'int',
            default: 0,
          },
          {
            name: 'blocked',
            type: 'boolean',
            default: false,
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
      'fraud_alerts',
      new TableIndex({
        name: 'IDX_FRAUD_ALERTS_USER_ID',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'fraud_alerts',
      new TableIndex({
        name: 'IDX_FRAUD_ALERTS_LOGIN_ATTEMPT_ID',
        columnNames: ['loginAttemptId'],
      }),
    );

    await queryRunner.createIndex(
      'fraud_alerts',
      new TableIndex({
        name: 'IDX_FRAUD_ALERTS_ALERT_TYPE',
        columnNames: ['alertType'],
      }),
    );

    await queryRunner.createIndex(
      'fraud_alerts',
      new TableIndex({
        name: 'IDX_FRAUD_ALERTS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'login_attempts',
      new TableIndex({
        name: 'IDX_LOGIN_ATTEMPTS_USER_ID',
        columnNames: ['userId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('fraud_alerts');
    await queryRunner.dropTable('login_attempts');
  }
}
