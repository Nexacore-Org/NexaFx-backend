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

describe('Ledger Balance Integrity E2E Tests (#966)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);

    // Create admin user via raw SQL (bypassing OTP flow)
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash('AdminPass123!', 10);
    const adminResult = await dataSource.query(
      `INSERT INTO "user" (
        email, password, first_name, last_name, is_verified, is_active, role,
        wallet_public_key, wallet_secret_key_encrypted, referral_code,
        balances, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id`,
      [
        'admin-ledger@example.com',
        hashedPassword,
        'Admin',
        'User',
        true,
        true,
        'ADMIN',
        'GAAAA...',
        'encrypted-key',
        'ADMIN01',
        JSON.stringify({ XLM: 10000, USD: 5000 }),
      ],
    );
    adminId = adminResult[0].id;

    // Generate JWT token for admin
    const loginResponse = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: 'admin-ledger@example.com',
        password: 'AdminPass123!',
      });

    adminToken = loginResponse.body.accessToken;
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  describe('POST /admin/ledger/verify', () => {
    it('reports BALANCED when no ledger entries exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/ledger/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.status).toBe('BALANCED');
      expect(response.body.discrepancies).toEqual([]);
    });

    it('reports BALANCED with balanced entries', async () => {
      // Manually insert balanced ledger entries
      const txId = '00000000-0000-0000-0000-000000000001';
      await dataSource.query(
        `INSERT INTO "ledger_entries" (id, "transactionId", "accountType", direction, amount, currency, "createdAt")
         VALUES
         ('11111111-0000-0000-0000-000000000001', $1, 'USER', 'CREDIT', 100, 'XLM', NOW()),
         ('11111111-0000-0000-0000-000000000002', $1, 'PLATFORM_LIABILITY', 'DEBIT', 100, 'XLM', NOW())`,
        [txId],
      );

      const response = await request(app.getHttpServer())
        .post('/admin/ledger/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.status).toBe('BALANCED');
    });

    it('reports DISCREPANCY with unbalanced entries', async () => {
      // Insert intentionally unbalanced entries (CREDIT 100 but only DEBIT 80)
      const txId = '00000000-0000-0000-0000-000000000002';
      await dataSource.query(
        `INSERT INTO "ledger_entries" (id, "transactionId", "accountType", direction, amount, currency, "createdAt")
         VALUES
         ('22222222-0000-0000-0000-000000000001', $1, 'USER', 'CREDIT', 100, 'XLM', NOW()),
         ('22222222-0000-0000-0000-000000000002', $1, 'PLATFORM_LIABILITY', 'DEBIT', 80, 'XLM', NOW())`,
        [txId],
      );

      const response = await request(app.getHttpServer())
        .post('/admin/ledger/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.status).toBe('DISCREPANCY');
      expect(response.body.discrepancies).toHaveLength(1);
      expect(response.body.discrepancies[0].currency).toBe('XLM');
    });
  });

  describe('GET /admin/ledger/entries', () => {
    it('returns 400 when transactionId is missing', async () => {
      await request(app.getHttpServer())
        .get('/admin/ledger/entries')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns ledger entries for a given transaction', async () => {
      const txId = '00000000-0000-0000-0000-000000000003';
      await dataSource.query(
        `INSERT INTO "ledger_entries" (id, "transactionId", "accountType", direction, amount, currency, "createdAt")
         VALUES
         ('33333333-0000-0000-0000-000000000001', $1, 'USER', 'CREDIT', 50, 'USD', NOW()),
         ('33333333-0000-0000-0000-000000000002', $1, 'PLATFORM_ASSET', 'DEBIT', 50, 'USD', NOW())`,
        [txId],
      );

      const response = await request(app.getHttpServer())
        .get(`/admin/ledger/entries?transactionId=${txId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /admin/ledger/balances', () => {
    it('returns platform balances grouped by currency and account type', async () => {
      const txId1 = '00000000-0000-0000-0000-000000000004';
      const txId2 = '00000000-0000-0000-0000-000000000005';
      await dataSource.query(
        `INSERT INTO "ledger_entries" (id, "transactionId", "accountType", direction, amount, currency, "createdAt")
         VALUES
         ('44444444-0000-0000-0000-000000000001', $1, 'USER', 'CREDIT', 200, 'XLM', NOW()),
         ('44444444-0000-0000-0000-000000000002', $1, 'PLATFORM_LIABILITY', 'DEBIT', 200, 'XLM', NOW()),
         ('44444444-0000-0000-0000-000000000003', $2, 'USER', 'DEBIT', 100, 'XLM', NOW()),
         ('44444444-0000-0000-0000-000000000004', $2, 'PLATFORM_ASSET', 'CREDIT', 100, 'XLM', NOW())`,
        [txId1, txId2],
      );

      const response = await request(app.getHttpServer())
        .get('/admin/ledger/balances')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Unauthenticated access', () => {
    it('rejects unauthenticated ledger verify requests', async () => {
      await request(app.getHttpServer())
        .post('/admin/ledger/verify')
        .expect(401);
    });

    it('rejects unauthenticated ledger entries requests', async () => {
      await request(app.getHttpServer())
        .get('/admin/ledger/entries')
        .expect(401);
    });

    it('rejects unauthenticated ledger balances requests', async () => {
      await request(app.getHttpServer())
        .get('/admin/ledger/balances')
        .expect(401);
    });
  });
});
