import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTransactionProcessingLockFields1711400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('transactions', [
      new TableColumn({
        name: 'processingLockedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'processingLockedBy',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('transactions', 'processingLockedBy');
    await queryRunner.dropColumn('transactions', 'processingLockedAt');
  }
}
