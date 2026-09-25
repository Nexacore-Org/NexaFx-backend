import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  setupTestDatabase,
} from '../helpers/db.helper';

/**
 * E2E coverage for the currencies domain.
 *
 * Exercises the real HTTP request -> guard -> controller -> service -> Postgres
 * round trip. Only true external boundaries are mocked (by app.helper.ts); the
 * exchange-rate provider is never reached because pairs below reference currency
 * codes that do not exist in the currencies table (getRate throws before any
 * network call and the service degrades gracefully).
 */
describe('Currencies E2E Tests (#1099)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;

  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-e2e';

  function tokenFor(user: { id: string; email: string; role: string }): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
  }

  function payload(res: request.Response): any {
    return res.body && res.body.data !== undefined ? res.body.data : res.body;
  }

  async function seedCurrency(
    code: string,
    overrides: Partial<{ isBase: boolean; isActive: boolean }> = {},
  ): Promise<string> {
    const id = uuidv4();
    await dataSource.query(
      `INSERT INTO "currencies"
         (id, code, name, symbol, decimals, "isBase", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 2, $5, $6, NOW(), NOW())`,
      [
        id,
        code,
        `${code} Currency`,
        '$',
        overrides.isBase ?? false,
        overrides.isActive ?? true,
      ],
    );
    return id;
  }

  async function seedPair(
    from: string,
    to: string,
    overrides: Partial<{ isActive: boolean; spreadPercent: number }> = {},
  ): Promise<string> {
    const id = uuidv4();
    await dataSource.query(
      `INSERT INTO "currency_pairs"
         (id, "fromCurrencyCode", "toCurrencyCode", "spreadPercent",
          "minAmountUsd", "maxAmountUsd", "isActive", "suspendedUntil",
          "suspensionReason", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, NULL, NULL, NOW(), NOW())`,
      [id, from, to, overrides.spreadPercent ?? 2, overrides.isActive ?? true],
    );
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
    const admin = await seedTestUser(dataSource, {
      email: 'currencies-admin@example.com',
      role: 'ADMIN',
    });
    adminToken = tokenFor(admin);
  });

  // ---------------------------------------------------------------------------
  // GET /v1/currencies
  // ---------------------------------------------------------------------------
  describe('GET /v1/currencies', () => {
    it('returns all supported currencies with the base currency first', async () => {
      await seedCurrency('USD');
      await seedCurrency('NGN', { isBase: true });

      const res = await request(app.getHttpServer())
        .get('/v1/currencies')
        .expect(200);

      const data = payload(res);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0].code).toBe('NGN');
      expect(data[0].isBase).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/currencies/base
  // ---------------------------------------------------------------------------
  describe('GET /v1/currencies/base', () => {
    it('returns the base currency', async () => {
      await seedCurrency('NGN', { isBase: true });
      await seedCurrency('USD');

      const res = await request(app.getHttpServer())
        .get('/v1/currencies/base')
        .expect(200);

      expect(payload(res).code).toBe('NGN');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/currencies/:code
  // ---------------------------------------------------------------------------
  describe('GET /v1/currencies/:code', () => {
    it('returns a currency by code (case-insensitive)', async () => {
      await seedCurrency('USD');

      const res = await request(app.getHttpServer())
        .get('/v1/currencies/usd')
        .expect(200);

      expect(payload(res).code).toBe('USD');
    });

    it('returns 404 for an unknown code', async () => {
      await request(app.getHttpServer()).get('/v1/currencies/ZZZ').expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/currencies/pairs  (public)
  // ---------------------------------------------------------------------------
  describe('GET /v1/currencies/pairs', () => {
    it('returns the list of currency pairs', async () => {
      await seedPair('AAA', 'BBB');

      const res = await request(app.getHttpServer())
        .get('/v1/currencies/pairs')
        .expect(200);

      const data = payload(res);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].fromCurrencyCode).toBe('AAA');
      expect(data[0].toCurrencyCode).toBe('BBB');
    });

    it('returns only active pairs when activeOnly=false is passed', async () => {
      await seedPair('AAA', 'BBB', { isActive: false });

      const res = await request(app.getHttpServer())
        .get('/v1/currencies/pairs?activeOnly=false')
        .expect(200);

      expect(payload(res)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/currencies/pairs/admin
  // ---------------------------------------------------------------------------
  describe('POST /v1/currencies/pairs/admin', () => {
    it('creates a currency pair (admin)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/currencies/pairs/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fromCurrencyCode: 'USD',
          toCurrencyCode: 'NGN',
          spreadPercent: 1.5,
        })
        .expect(201);

      const data = payload(res);
      expect(data.fromCurrencyCode).toBe('USD');
      expect(data.toCurrencyCode).toBe('NGN');
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/v1/currencies/pairs/admin')
        .send({ fromCurrencyCode: 'USD', toCurrencyCode: 'NGN' })
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const user = await seedTestUser(dataSource, {
        email: 'regular@example.com',
        role: 'USER',
      });
      const token = tokenFor(user);

      await request(app.getHttpServer())
        .post('/v1/currencies/pairs/admin')
        .set('Authorization', `Bearer ${token}`)
        .send({ fromCurrencyCode: 'USD', toCurrencyCode: 'NGN' })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/currencies/pairs/admin/:id
  // ---------------------------------------------------------------------------
  describe('PATCH /v1/currencies/pairs/admin/:id', () => {
    it('updates a currency pair (admin)', async () => {
      const id = await seedPair('AAA', 'BBB', { spreadPercent: 2 });

      const res = await request(app.getHttpServer())
        .patch(`/v1/currencies/pairs/admin/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ spreadPercent: 3.5 })
        .expect(200);

      expect(parseFloat(payload(res).spreadPercent)).toBe(3.5);
    });

    it('returns 401 without a token', async () => {
      const id = await seedPair('AAA', 'BBB');
      await request(app.getHttpServer())
        .patch(`/v1/currencies/pairs/admin/${id}`)
        .send({ spreadPercent: 3.5 })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/currencies/pairs/admin/:id/suspend
  // ---------------------------------------------------------------------------
  describe('POST /v1/currencies/pairs/admin/:id/suspend', () => {
    it('suspends an active pair (admin)', async () => {
      const id = await seedPair('AAA', 'BBB', { isActive: true });

      const res = await request(app.getHttpServer())
        .post(`/v1/currencies/pairs/admin/${id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'maintenance', duration: 'PT1H' })
        .expect(201);

      const data = payload(res);
      expect(data.isActive).toBe(false);
      expect(data.suspensionReason).toBe('maintenance');
      expect(data.suspendedUntil).toBeTruthy();
    });

    it('returns 401 without a token', async () => {
      const id = await seedPair('AAA', 'BBB');
      await request(app.getHttpServer())
        .post(`/v1/currencies/pairs/admin/${id}/suspend`)
        .send({ reason: 'maintenance', duration: 'PT1H' })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/currencies/pairs/admin/:id/resume
  // ---------------------------------------------------------------------------
  describe('POST /v1/currencies/pairs/admin/:id/resume', () => {
    it('resumes a suspended pair (admin)', async () => {
      const id = await seedPair('AAA', 'BBB', { isActive: false });

      const res = await request(app.getHttpServer())
        .post(`/v1/currencies/pairs/admin/${id}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const data = payload(res);
      expect(data.isActive).toBe(true);
      expect(data.suspensionReason).toBeNull();
    });

    it('returns 401 without a token', async () => {
      const id = await seedPair('AAA', 'BBB', { isActive: false });
      await request(app.getHttpServer())
        .post(`/v1/currencies/pairs/admin/${id}/resume`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/currencies/pairs/admin/health
  // ---------------------------------------------------------------------------
  describe('GET /v1/currencies/pairs/admin/health', () => {
    it('returns pair health (admin)', async () => {
      await seedPair('AAA', 'BBB');

      const res = await request(app.getHttpServer())
        .get('/v1/currencies/pairs/admin/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = payload(res);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].pair).toBe('AAA/BBB');
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/v1/currencies/pairs/admin/health')
        .expect(401);
    });
  });
});
