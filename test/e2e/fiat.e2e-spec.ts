import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import { closeTestDatabase, setupTestDatabase } from '../helpers/db.helper';

/**
 * End-to-end coverage for fiat v2 deposit idempotency.
 *
 * Exercises the real NestJS module graph (guards, pipes, controllers,
 * services) against a real test database. Only true external boundaries
 * (Stellar Horizon, third-party payment providers) are mocked via the
 * shared app.helper bootstrap.
 */
describe('Fiat v2 deposit idempotency (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;

  const depositBody = {
    amount: 100,
    currency: 'NGN',
    provider: 'flutterwave',
  };

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    dataSource = app.get(DataSource);

    // Register + authenticate a real user through the real auth wiring.
    const email = `fiat-e2e-${Date.now()}@example.com`;
    const password = 'Password123!';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect((res) => {
        if (res.status >= 400) {
          throw new Error(`register failed: ${res.status}`);
        }
      });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    accessToken =
      login.body?.data?.accessToken ?? login.body?.accessToken ?? '';
    userId =
      login.body?.data?.user?.id ?? login.body?.user?.id ?? '';
  });

  afterAll(async () => {
    if (dataSource) {
      // Clean up fixture data created by this spec (no cross-test pollution).
      await dataSource.query(
        'DELETE FROM fiat_deposits WHERE user_id = $1',
        [userId],
      );
      await dataSource.query(
        'DELETE FROM transactions WHERE user_id = $1',
        [userId],
      );
    }
    if (app) {
      await app.close();
    }
    await closeTestDatabase();
  });

  it('rejects a deposit without an Idempotency-Key header with 422', async () => {
    await request(app.getHttpServer())
      .post('/fiat/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(depositBody)
      .expect(422);
  });

  it('creates exactly one deposit for two identical requests sharing an Idempotency-Key', async () => {
    const idempotencyKey = `fiat-idem-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post('/fiat/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(depositBody);

    const second = await request(app.getHttpServer())
      .post('/fiat/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(depositBody);

    expect(first.status).toBeLessThan(400);
    expect(second.status).toBeLessThan(400);

    // Verify against the database, not just the HTTP responses.
    const rows = await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM fiat_deposits WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    );
    expect(rows[0].count).toBe(1);
  });

  it('credits the balance exactly once when a success callback is delivered twice', async () => {
    const idempotencyKey = `fiat-cb-success-${Date.now()}`;

    const deposit = await request(app.getHttpServer())
      .post('/fiat/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(depositBody)
      .expect((res) => {
        if (res.status >= 400) {
          throw new Error(`deposit failed: ${res.status}`);
        }
      });

    const reference =
      deposit.body?.data?.reference ??
      deposit.body?.reference ??
      deposit.body?.data?.txRef ??
      deposit.body?.txRef;

    const balanceBefore = await dataSource.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId],
    );
    const before = Number(balanceBefore[0]?.balance ?? 0);

    const callback = {
      status: 'successful',
      txRef: reference,
      flwRef: reference,
      amount: depositBody.amount,
      currency: depositBody.currency,
    };

    // Real-world webhooks are delivered more than once; both must be safe.
    await request(app.getHttpServer())
      .post('/fiat/webhook/flutterwave')
      .send(callback);
    await request(app.getHttpServer())
      .post('/fiat/webhook/flutterwave')
      .send(callback);

    const depositRow = await dataSource.query(
      'SELECT status FROM fiat_deposits WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    );
    expect(depositRow[0]?.status).toBe('completed');

    const balanceAfter = await dataSource.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId],
    );
    const after = Number(balanceAfter[0]?.balance ?? 0);

    // Credited exactly once, not twice.
    expect(after - before).toBe(depositBody.amount);
  });

  it('leaves the balance unaffected and marks the deposit failed on a failure callback', async () => {
    const idempotencyKey = `fiat-cb-fail-${Date.now()}`;

    const deposit = await request(app.getHttpServer())
      .post('/fiat/deposit')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(depositBody)
      .expect((res) => {
        if (res.status >= 400) {
          throw new Error(`deposit failed: ${res.status}`);
        }
      });

    const reference =
      deposit.body?.data?.reference ??
      deposit.body?.reference ??
      deposit.body?.data?.txRef ??
      deposit.body?.txRef;

    const balanceBefore = await dataSource.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId],
    );
    const before = Number(balanceBefore[0]?.balance ?? 0);

    await request(app.getHttpServer())
      .post('/fiat/webhook/flutterwave')
      .send({
        status: 'failed',
        txRef: reference,
        flwRef: reference,
        amount: depositBody.amount,
        currency: depositBody.currency,
      });

    const depositRow = await dataSource.query(
      'SELECT status FROM fiat_deposits WHERE user_id = $1 AND idempotency_key = $2',
      [userId, idempotencyKey],
    );
    expect(depositRow[0]?.status).toBe('failed');

    const balanceAfter = await dataSource.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId],
    );
    const after = Number(balanceAfter[0]?.balance ?? 0);
    expect(after).toBe(before);
  });
});
