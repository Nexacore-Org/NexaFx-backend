import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBalanceLastSyncedAtColumn1712000000000 implements MigrationInterface {
  name = 'AddBalanceLastSyncedAtColumn1712000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'balanceLastSyncedAt',
        type: 'timestamp with time zone',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'balanceLastSyncedAt');
  }
}
