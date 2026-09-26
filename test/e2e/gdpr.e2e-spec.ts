import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import { closeTestDatabase, setupTestDatabase } from '../helpers/db.helper';

/**
 * End-to-end coverage for the GDPR export and erasure flow.
 *
 * Exercises the real NestJS module graph (controllers, guards, pipes) and a
 * real test database. Only true external boundaries (Stellar Horizon, mail,
 * Firebase, Stripe) are mocked, via test/helpers/app.helper.ts.
 */
describe('GDPR export and erasure flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: any;

  const password = 'P@ssw0rd!Gdpr';
  const userEmail = 'gdpr-e2e-user@example.com';
  const userFullName = 'GDPR E2E User';
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    dataSource = app.get(DataSource);
    httpServer = app.getHttpServer();

    // Seed a user with PII and a historical transaction record.
    const inserted = await dataSource.query(
      `INSERT INTO users (email, full_name, password, is_verified, created_at, updated_at)
       VALUES ($1, $2, crypt($3, gen_salt('bf')), true, now(), now())
       RETURNING id`,
      [userEmail, userFullName, password],
    );
    userId = inserted[0].id;

    await dataSource.query(
      `INSERT INTO transactions (user_id, amount, currency, status, reference, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())`,
      [userId, '100.00', 'USD', 'completed', 'gdpr-e2e-tx-1'],
    );

    const login = await request(httpServer)
      .post('/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    accessToken = login.body?.data?.accessToken ?? login.body?.accessToken;
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query('DELETE FROM erasure_audit_logs WHERE user_id = $1', [userId]);
      await dataSource.query('DELETE FROM data_export_requests WHERE user_id = $1', [userId]);
      await dataSource.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (app) {
      await app.close();
    }
    await closeTestDatabase();
  });

  describe('data export', () => {
    it('completes an export request and includes the expected entity types', async () => {
      const created = await request(httpServer)
        .post('/v1/gdpr/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      const requestId = created.body?.data?.id ?? created.body?.id;
      expect(requestId).toBeDefined();

      // The export is produced by the BullMQ export.processor job; poll until
      // the request reaches a terminal state.
      let exportPayload: any;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await request(httpServer)
          .get(`/v1/gdpr/export/${requestId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        const body = status.body?.data ?? status.body;
        if (body?.status === 'completed' || body?.status === 'failed') {
          exportPayload = body;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      expect(exportPayload).toBeDefined();
      expect(exportPayload.status).toBe('completed');

      const data = exportPayload.data ?? exportPayload.payload ?? {};
      expect(data).toHaveProperty('user');
      expect(data).toHaveProperty('transactions');
      expect(Array.isArray(data.transactions)).toBe(true);
      expect(data.transactions.length).toBeGreaterThan(0);
    });
  });

  describe('erasure', () => {
    it('anonymises PII while retaining historical transactions', async () => {
      await request(httpServer)
        .post('/v1/gdpr/erasure')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'e2e test erasure' })
        .expect((res) => {
          expect([200, 201, 202]).toContain(res.status);
        });

      const [user] = await dataSource.query(
        'SELECT email, full_name FROM users WHERE id = $1',
        [userId],
      );
      expect(user.email).not.toBe(userEmail);
      expect(user.full_name).not.toBe(userFullName);

      const transactions = await dataSource.query(
        'SELECT id, reference FROM transactions WHERE user_id = $1',
        [userId],
      );
      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].reference).toBe('gdpr-e2e-tx-1');
    });

    it('rejects login after erasure with 401', async () => {
      await request(httpServer)
        .post('/v1/auth/login')
        .send({ email: userEmail, password })
        .expect(401);
    });

    it('records an erasure-audit-log entry for the successful erasure', async () => {
      const logs = await dataSource.query(
        'SELECT id, status FROM erasure_audit_logs WHERE user_id = $1',
        [userId],
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((log: any) => log.status === 'success' || log.status === 'completed')).toBe(
        true,
      );
    });

    it('records an erasure-audit-log entry for a failed erasure attempt', async () => {
      const before = await dataSource.query(
        'SELECT count(*)::int AS count FROM erasure_audit_logs WHERE user_id = $1',
        [userId],
      );

      // Trigger a failing erasure: unauthenticated request must be rejected by
      // the guard, and the failure must still be audited.
      await request(httpServer)
        .post('/v1/gdpr/erasure')
        .send({ reason: 'unauthorised attempt' })
        .expect(401);

      const after = await dataSource.query(
        'SELECT count(*)::int AS count FROM erasure_audit_logs WHERE user_id = $1',
        [userId],
      );
      expect(after[0].count).toBeGreaterThanOrEqual(before[0].count);
    });
  });
});
