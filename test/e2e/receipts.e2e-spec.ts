import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';
import { v4 as uuidv4 } from 'uuid';

describe('Receipts E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let userId: string;
  let transactionId: string;

  const testEmail = 'receipts-user@example.com';
  const testPassword = 'ReceiptsPass123!';

  /**
   * Helper — sign up a fresh user via the real auth flow and return their JWT.
   */
  async function registerAndLogin(
    email: string,
    password: string,
  ): Promise<{ token: string; id: string }> {
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password,
        firstName: 'Receipts',
        lastName: 'Tester',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);

    const rows = await dataSource.query(
      `SELECT id FROM "users" WHERE email = $1`,
      [email],
    );
    return { token: res.body.accessToken, id: rows[0].id };
  }

  /**
   * Seed a minimal transaction row directly via SQL so we control all fields
   * (bypasses Stellar / KYC guards that the real deposit endpoint enforces).
   */
  async function seedTransaction(
    ownerId: string,
    overrides: Partial<{
      status: string;
      type: string;
      amount: string;
      currency: string;
      txHash: string;
    }> = {},
  ): Promise<string> {
    const id = uuidv4();
    await dataSource.query(
      `INSERT INTO "transactions"
         (id, "userId", type, amount, currency, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        id,
        ownerId,
        overrides.type ?? 'DEPOSIT',
        overrides.amount ?? '100',
        overrides.currency ?? 'USD',
        overrides.status ?? 'SUCCESS',
      ],
    );
    if (overrides.txHash) {
      await dataSource.query(
        `UPDATE "transactions" SET "txHash" = $1 WHERE id = $2`,
        [overrides.txHash, id],
      );
    }
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    // Create a verified user + their JWT for every test
    const auth = await registerAndLogin(testEmail, testPassword);
    userToken = auth.token;
    userId = auth.id;

    // Seed one completed transaction owned by this user
    transactionId = await seedTransaction(userId);
  });

  // ---------------------------------------------------------------------------
  // GET /v1/receipts/transaction/:id  — PDF receipt download
  // ---------------------------------------------------------------------------
  describe('GET /v1/receipts/transaction/:id', () => {
    it('returns a PDF receipt for a valid transaction owned by the caller', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toContain(
        `receipt-${transactionId}`,
      );
    });

    it('returns 404 when the transaction does not exist', async () => {
      const nonExistentId = uuidv4();
      const res = await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${nonExistentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when the transaction belongs to another user', async () => {
      // Seed a second user + a transaction owned by them
      const otherAuth = await registerAndLogin(
        'other-receipts@example.com',
        'OtherPass123!',
      );
      const otherTxId = await seedTransaction(otherAuth.id);

      // Original user cannot access other user's transaction
      const res = await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${otherTxId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}`)
        .expect(401);
    });

    it('returns 401 for an invalid / malformed token', async () => {
      await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/receipts/statement?month=YYYY-MM  — Monthly statement PDF
  // ---------------------------------------------------------------------------
  describe('GET /v1/receipts/statement', () => {
    it('returns a PDF statement when transactions exist for the given month', async () => {
      // Seed a transaction with a known creation date for a specific month
      const statementTxId = uuidv4();
      await dataSource.query(
        `INSERT INTO "transactions"
           (id, "userId", type, amount, currency, status, "createdAt", "updatedAt")
         VALUES ($1, $2, 'DEPOSIT', '200', 'USD', 'SUCCESS',
                 '2026-01-15 10:00:00+00', NOW())`,
        [statementTxId, userId],
      );

      const res = await request(app.getHttpServer())
        .get('/v1/receipts/statement?month=2026-01')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toContain('statement-2026-01');
    });

    it('returns 404 when there are no transactions in the requested month', async () => {
      // No transactions exist for this far-future month
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/statement?month=2099-12')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid month format (bad format)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/statement?month=01-2026')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid month value (month 13)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/statement?month=2026-13')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/v1/receipts/statement?month=2026-01')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/receipts/export?format=csv|excel&month=YYYY-MM
  // ---------------------------------------------------------------------------
  describe('GET /v1/receipts/export', () => {
    beforeEach(async () => {
      // Seed a transaction in the target month for export tests
      await dataSource.query(
        `INSERT INTO "transactions"
           (id, "userId", type, amount, currency, status, "createdAt", "updatedAt")
         VALUES ($1, $2, 'DEPOSIT', '150', 'USD', 'SUCCESS',
                 '2026-03-10 10:00:00+00', NOW())`,
        [uuidv4(), userId],
      );
    });

    it('exports transactions as CSV for a valid month', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/export?format=csv&month=2026-03')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain(
        'transactions-2026-03',
      );
    });

    it('exports transactions as Excel for a valid month', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/export?format=excel&month=2026-03')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      );
    });

    it('returns 400 for an unsupported format value', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/export?format=pdf&month=2026-03')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid month format', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/export?format=csv&month=2026-3')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 400 when format query param is missing', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/export?month=2026-03')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 when there are no transactions for the requested month', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/receipts/export?format=csv&month=2099-12')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/v1/receipts/export?format=csv&month=2026-03')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/receipts/transaction/:id/email  — Email receipt dispatch
  // ---------------------------------------------------------------------------
  describe('GET /v1/receipts/transaction/:id/email', () => {
    it('returns a success message when the email is dispatched (SKIP_EMAIL_SENDING=true)', async () => {
      // app.helper.ts mocks Mailgun; the service also respects SKIP_EMAIL_SENDING
      const res = await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}/email`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // The controller wraps the response in TransformResponseInterceptor,
      // so accept either the raw shape or the wrapped data shape.
      const body: unknown = res.body;
      const message: string =
        typeof body === 'object' &&
        body !== null &&
        'data' in (body as Record<string, unknown>)
          ? ((body as Record<string, unknown>).data as Record<string, string>)
              .message
          : (body as Record<string, string>).message;

      expect(typeof message).toBe('string');
      expect(message.toLowerCase()).toContain('email');
    });

    it('returns 404 when the transaction does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${uuidv4()}/email`)
        .set('Authorization', `Bearer ${userToken}`);

      // Controller re-throws as NotFoundException when the underlying call fails
      expect([404]).toContain(res.status);
    });

    it('returns 404 when the transaction belongs to another user', async () => {
      const otherAuth = await registerAndLogin(
        'email-other@example.com',
        'OtherPass123!',
      );
      const otherTxId = await seedTransaction(otherAuth.id);

      const res = await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${otherTxId}/email`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([404]).toContain(res.status);
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}/email`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Unauthenticated access — blanket check across all endpoints
  // ---------------------------------------------------------------------------
  describe('Unauthenticated access', () => {
    it('rejects GET /v1/receipts/transaction/:id without a token (401)', async () => {
      await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}`)
        .expect(401);
    });

    it('rejects GET /v1/receipts/statement without a token (401)', async () => {
      await request(app.getHttpServer())
        .get('/v1/receipts/statement?month=2026-01')
        .expect(401);
    });

    it('rejects GET /v1/receipts/export without a token (401)', async () => {
      await request(app.getHttpServer())
        .get('/v1/receipts/export?format=csv&month=2026-01')
        .expect(401);
    });

    it('rejects GET /v1/receipts/transaction/:id/email without a token (401)', async () => {
      await request(app.getHttpServer())
        .get(`/v1/receipts/transaction/${transactionId}/email`)
        .expect(401);
    });
  });
});
