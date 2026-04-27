import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddTransactionNotificationCompositeIndexes1711200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndices('transactions', [
      new TableIndex({
        name: 'IDX_transactions_status_createdAt',
        columnNames: ['status', 'createdAt'],
      }),
      new TableIndex({
        name: 'IDX_transactions_userId_status',
        columnNames: ['userId', 'status'],
      }),
    ]);

    await queryRunner.createIndices('notifications', [
      new TableIndex({
        name: 'IDX_notifications_userId_status',
        columnNames: ['userId', 'status'],
      }),
      new TableIndex({
        name: 'IDX_notifications_userId_createdAt',
        columnNames: ['userId', 'createdAt'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'notifications',
      'IDX_notifications_userId_createdAt',
    );
    await queryRunner.dropIndex(
      'notifications',
      'IDX_notifications_userId_status',
    );
    await queryRunner.dropIndex(
      'transactions',
      'IDX_transactions_userId_status',
    );
    await queryRunner.dropIndex(
      'transactions',
      'IDX_transactions_status_createdAt',
    );
  }
}
