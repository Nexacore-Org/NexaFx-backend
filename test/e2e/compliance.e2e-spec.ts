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
 * E2E coverage for the compliance domain.
 *
 * Exercises the real HTTP request -> global JwtAuthGuard/RolesGuard ->
 * controller -> service -> Postgres round trip. No third-party boundary is
 * touched (no Stripe/Stellar/Mailgun/Firebase calls).
 *
 * Note: the routes below come from the module actually wired into AppModule
 * (`src/modules/compliance`). The issue text referenced an unwired scaffold at
 * `src/compliance` whose routes do not exist in the running app.
 */
describe('Admin Compliance E2E Tests (#1098)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let adminId: string;

  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-e2e';

  function tokenFor(user: { id: string; email: string; role: string }): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
  }

  /** The global TransformResponseInterceptor wraps successful payloads in `data`. */
  function payload(res: request.Response): any {
    return res.body && res.body.data !== undefined ? res.body.data : res.body;
  }

  async function seedFlag(
    ownerId: string,
    overrides: Partial<{ status: string; rule: string }> = {},
  ): Promise<string> {
    const id = uuidv4();
    await dataSource.query(
      `INSERT INTO "compliance_flags"
         (id, "userId", rule, "riskScore", details, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 10, '{}', $4, NOW(), NOW())`,
      [
        id,
        ownerId,
        overrides.rule ?? 'large_transaction',
        overrides.status ?? 'OPEN',
      ],
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
      email: 'compliance-admin@example.com',
      role: 'ADMIN',
    });
    adminId = admin.id;
    adminToken = tokenFor(admin);
  });

  // ---------------------------------------------------------------------------
  // GET /v1/admin/compliance/flags
  // ---------------------------------------------------------------------------
  describe('GET /v1/admin/compliance/flags', () => {
    it('lists flags in a paginated envelope', async () => {
      await seedFlag(adminId);

      const res = await request(app.getHttpServer())
        .get('/v1/admin/compliance/flags')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = payload(res);
      expect(data.total).toBe(1);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].rule).toBe('large_transaction');
    });

    it('returns 400 for an invalid status filter', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/compliance/flags?status=NOT_A_STATUS')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/compliance/flags')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/admin/compliance/dashboard
  // ---------------------------------------------------------------------------
  describe('GET /v1/admin/compliance/dashboard', () => {
    it('returns dashboard statistics', async () => {
      await seedFlag(adminId, { status: 'OPEN' });

      const res = await request(app.getHttpServer())
        .get('/v1/admin/compliance/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = payload(res);
      expect(data).toHaveProperty('flagsByRule');
      expect(data).toHaveProperty('flagsByStatus');
      expect(data).toHaveProperty('sarsFiledThisMonth');
      expect(Array.isArray(data.highRiskUsers)).toBe(true);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/compliance/dashboard')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/admin/compliance/config
  // ---------------------------------------------------------------------------
  describe('GET /v1/admin/compliance/config', () => {
    it('returns the AML configuration (auto-created with defaults)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/compliance/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = payload(res);
      expect(data).toHaveProperty('largeTxThresholdUsd');
      expect(data).toHaveProperty('rapidMovementCount');
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/compliance/config')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/admin/compliance/config
  // ---------------------------------------------------------------------------
  describe('PATCH /v1/admin/compliance/config', () => {
    it('updates the AML configuration', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/admin/compliance/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rapidMovementCount: 7 })
        .expect(200);

      expect(payload(res).rapidMovementCount).toBe(7);
    });

    it('returns 400 for a validation failure', async () => {
      await request(app.getHttpServer())
        .patch('/v1/admin/compliance/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rapidMovementCount: 0 })
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch('/v1/admin/compliance/config')
        .send({ rapidMovementCount: 7 })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/admin/compliance/export
  // ---------------------------------------------------------------------------
  describe('GET /v1/admin/compliance/export', () => {
    it('exports compliance data as CSV', async () => {
      await seedFlag(adminId);

      const res = await request(app.getHttpServer())
        .get('/v1/admin/compliance/export?from=2000-01-01&to=2100-01-01')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain('Flag ID,User ID,Rule');
      expect(res.text).toContain(adminId);
    });

    it('returns 400 when from/to are missing', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/compliance/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/compliance/export?from=2000-01-01&to=2100-01-01')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/admin/compliance/flags/:id
  // ---------------------------------------------------------------------------
  describe('PATCH /v1/admin/compliance/flags/:id', () => {
    it('updates a flag status', async () => {
      const flagId = await seedFlag(adminId);

      const res = await request(app.getHttpServer())
        .patch(`/v1/admin/compliance/flags/${flagId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'UNDER_REVIEW' })
        .expect(200);

      expect(payload(res).status).toBe('UNDER_REVIEW');
    });

    it('returns 400 for a non-UUID flag id', async () => {
      await request(app.getHttpServer())
        .patch('/v1/admin/compliance/flags/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'UNDER_REVIEW' })
        .expect(400);
    });

    it('returns 400 when status is missing', async () => {
      const flagId = await seedFlag(adminId);

      await request(app.getHttpServer())
        .patch(`/v1/admin/compliance/flags/${flagId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      const flagId = await seedFlag(adminId);
      await request(app.getHttpServer())
        .patch(`/v1/admin/compliance/flags/${flagId}`)
        .send({ status: 'CLEARED' })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/admin/compliance/flags/:id/sar
  // ---------------------------------------------------------------------------
  describe('POST /v1/admin/compliance/flags/:id/sar', () => {
    it('files a SAR for a flag', async () => {
      const flagId = await seedFlag(adminId);

      const res = await request(app.getHttpServer())
        .post(`/v1/admin/compliance/flags/${flagId}/sar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          narrative: 'Suspicious structuring activity observed.',
          reportReference: 'SAR-001',
        })
        .expect(201);

      const data = payload(res);
      expect(data.flagId).toBe(flagId);
      expect(data.reportReference).toBe('SAR-001');
    });

    it('returns 400 for a too-short narrative', async () => {
      const flagId = await seedFlag(adminId);

      await request(app.getHttpServer())
        .post(`/v1/admin/compliance/flags/${flagId}/sar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ narrative: 'short', reportReference: 'SAR-002' })
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      const flagId = await seedFlag(adminId);
      await request(app.getHttpServer())
        .post(`/v1/admin/compliance/flags/${flagId}/sar`)
        .send({
          narrative: 'Suspicious activity observed here.',
          reportReference: 'SAR-003',
        })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Role-based access
  // ---------------------------------------------------------------------------
  describe('Role-based access control', () => {
    it('returns 403 for an authenticated non-admin user', async () => {
      const user = await seedTestUser(dataSource, {
        email: 'regular-user@example.com',
        role: 'USER',
      });
      const token = tokenFor(user);

      await request(app.getHttpServer())
        .get('/v1/admin/compliance/flags')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
