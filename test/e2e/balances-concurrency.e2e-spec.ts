import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BalancesModule } from '../../src/balances/balances.module';
import { BalanceService } from '../../src/balances/balance.service';

/**
 * Real-Postgres concurrency tests for BalanceService (#1453).
 *
 * Runs in an isolated schema holding a minimal users table, so it does not
 * depend on migrations or on the shape of the application's own users table.
 * The pool has several connections, so parallel calls really do race.
 */
const SCHEMA = 'balance_concurrency_e2e';

describe('BalanceService concurrency (e2e, real Postgres)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: BalanceService;
  let userId: string;

  beforeAll(async () => {
    const admin = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
    });
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(
      `CREATE TABLE ${SCHEMA}.users (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         balances jsonb DEFAULT '{}'::jsonb
       )`,
    );
    await admin.destroy();

    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env.DATABASE_URL,
          extra: { max: 10, options: `-c search_path=${SCHEMA}` },
        }),
        BalancesModule,
      ],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(BalanceService);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    }
    await moduleRef?.close();
  });

  async function seed(balances: Record<string, string | number>) {
    const rows: Array<{ id: string }> = await dataSource.query(
      'INSERT INTO users (balances) VALUES ($1::jsonb) RETURNING id',
      [JSON.stringify(balances)],
    );
    userId = rows[0].id;
  }

  it('two parallel debits that together exceed the balance: exactly one fails', async () => {
    await seed({ XLM: 100 });

    const results = await Promise.allSettled([
      service.debit(userId, 'XLM', '60'),
      service.debit(userId, 'XLM', '60'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(await service.getBalance(userId, 'XLM')).toBe('40');
  });

  it('many parallel debits can never overdraw the account', async () => {
    await seed({ XLM: 100 });

    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => service.debit(userId, 'XLM', '10')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(20);
    expect(await service.getBalance(userId, 'XLM')).toBe('0');
  });

  it('parallel credits are never lost and carry no float drift', async () => {
    await seed({});

    await Promise.all(
      Array.from({ length: 50 }, () => service.credit(userId, 'USD', '0.1')),
    );

    // 50 x 0.1 is exactly 5 in numeric, but 5.000000000000003 or similar
    // with float accumulation.
    expect(await service.getBalance(userId, 'USD')).toBe('5');
  });

  it('keeps 8-decimal precision exactly', async () => {
    await seed({ BTC: '0.1' });

    await service.credit(userId, 'BTC', '0.2');
    expect(await service.getBalance(userId, 'BTC')).toBe('0.3');

    await service.debit(userId, 'BTC', '0.00000001');
    expect(await service.getBalance(userId, 'BTC')).toBe('0.29999999');
  });

  it('mixed parallel credits and debits settle to the exact total', async () => {
    await seed({ XLM: 1000 });

    await Promise.all([
      ...Array.from({ length: 20 }, () => service.credit(userId, 'XLM', '5')),
      ...Array.from({ length: 20 }, () => service.debit(userId, 'XLM', '3')),
    ]);

    expect(await service.getBalance(userId, 'XLM')).toBe('1040');
  });

  it('debits a currency the user has no entry for as insufficient', async () => {
    await seed({ XLM: 5 });

    await expect(service.debit(userId, 'EUR', '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await service.getBalance(userId, 'EUR')).toBe('0');
  });

  it('rejects an unknown user with NotFound, not Insufficient', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';

    await expect(service.debit(missing, 'XLM', '1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.credit(missing, 'XLM', '1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getBalance(missing, 'XLM')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rolls back with the surrounding transaction', async () => {
    await seed({ XLM: 100 });

    await expect(
      dataSource.transaction(async (manager) => {
        await service.debit(userId, 'XLM', '70', manager);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await service.getBalance(userId, 'XLM')).toBe('100');
  });

  it('rejects non-positive and non-finite amounts', async () => {
    await seed({ XLM: 100 });

    await expect(service.debit(userId, 'XLM', '0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.debit(userId, 'XLM', '-5')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.credit(userId, 'XLM', NaN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await service.getBalance(userId, 'XLM')).toBe('100');
  });
});
