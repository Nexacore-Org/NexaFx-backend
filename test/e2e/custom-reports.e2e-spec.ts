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
 * E2E coverage for the custom-reports domain.
 *
 * Exercises the real HTTP request -> global JwtAuthGuard/RolesGuard ->
 * controller -> service -> Postgres round trip. No third-party boundary is
 * touched. Routes are versioned as `/v2/custom-reports` by the controller.
 */
describe('Custom Reports E2E Tests (#1100)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let adminId: string;

  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-e2e';
  const BASE = '/v2/custom-reports';

  const validDefinition = {
    name: 'Transactions Report',
    entity: 'TRANSACTIONS',
    filters: {},
    columns: ['id', 'amount', 'currency', 'status', 'createdAt'],
  };

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

  async function seedTransaction(ownerId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO "transactions"
         (id, "userId", type, amount, currency, status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'DEPOSIT', '100', 'USD', 'SUCCESS', NOW(), NOW())`,
      [uuidv4(), ownerId],
    );
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
      email: 'custom-reports-admin@example.com',
      role: 'ADMIN',
    });
    adminId = admin.id;
    adminToken = tokenFor(admin);
  });

  // ---------------------------------------------------------------------------
  // POST /v2/custom-reports/definitions
  // ---------------------------------------------------------------------------
  describe('POST /v2/custom-reports/definitions', () => {
    it('creates a report definition (admin)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/definitions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDefinition)
        .expect(201);

      const data = payload(res);
      expect(data.id).toBeTruthy();
      expect(data.name).toBe('Transactions Report');
      expect(data.createdBy).toBe(adminId);
    });

    it('returns 400 for an invalid entity target', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/definitions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validDefinition, entity: 'NOT_AN_ENTITY' })
        .expect(400);
    });

    it('returns 400 for a disallowed column', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/definitions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validDefinition, columns: ['id', 'password'] })
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/definitions`)
        .send(validDefinition)
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const user = await seedTestUser(dataSource, {
        email: 'regular-custom-reports@example.com',
        role: 'USER',
      });

      await request(app.getHttpServer())
        .post(`${BASE}/definitions`)
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send(validDefinition)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v2/custom-reports/definitions/:id/run
  // ---------------------------------------------------------------------------
  describe('GET /v2/custom-reports/definitions/:id/run', () => {
    let definitionId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/definitions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validDefinition)
        .expect(201);
      definitionId = payload(res).id;
    });

    it('runs a report and returns JSON rows', async () => {
      await seedTransaction(adminId);

      const res = await request(app.getHttpServer())
        .get(`${BASE}/definitions/${definitionId}/run`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = payload(res);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
    });

    it('runs a report and returns CSV when format=csv', async () => {
      await seedTransaction(adminId);

      const res = await request(app.getHttpServer())
        .get(`${BASE}/definitions/${definitionId}/run?format=csv`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = payload(res);
      expect(typeof data).toBe('string');
      expect(data).toContain('id,amount,currency,status,createdAt');
    });

    it('returns 404 for an unknown definition', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/definitions/${uuidv4()}/run`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/definitions/${definitionId}/run`)
        .expect(401);
    });
  });
});
