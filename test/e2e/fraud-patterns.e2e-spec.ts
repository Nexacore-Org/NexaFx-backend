import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';

describe('Fraud Patterns E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let regularUserAccessToken: string;

  const createPatternPayload = {
    name: 'Test Velocity Pattern',
    description: 'More than 10 transactions in 5 minutes',
    severity: 'MEDIUM' as const,
    action: 'FLAG' as const,
    conditions: [{ field: 'txCountLast5Min', op: 'GTE' as const, value: 10 }],
  };

  const invalidCreatePayload = {
    name: '',
    description: 'Missing required fields',
    severity: 'INVALID_SEVERITY',
    action: 'INVALID_ACTION',
    conditions: [{ field: 'amountUsd', op: 'GTE', value: 1000 }],
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const adminEmail = 'admin-fp@example.com';
    const adminPassword = 'AdminPassword123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: adminEmail,
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'FraudPatterns',
        phone: '+12223334444',
      })
      .expect(200);

    const adminOtp = await getLatestOtp(dataSource, adminEmail);
    const adminResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: adminEmail, otp: adminOtp })
      .expect(200);

    adminAccessToken = adminResponse.body.accessToken;

    await dataSource.query(`UPDATE "user" SET role = $1 WHERE email = $2`, [
      'ADMIN',
      adminEmail,
    ]);

    const userEmail = 'user-fp@example.com';
    const userPassword = 'UserPassword123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: userEmail,
        password: userPassword,
        firstName: 'Regular',
        lastName: 'FraudPatterns',
        phone: '+15556667777',
      })
      .expect(200);

    const userOtp = await getLatestOtp(dataSource, userEmail);
    const userResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: userEmail, otp: userOtp })
      .expect(200);

    regularUserAccessToken = userResponse.body.accessToken;
  });

  describe('POST /v1/admin/fraud-patterns', () => {
    it('should create a fraud pattern as admin (happy path)', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(createPatternPayload)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(createPatternPayload.name);
      expect(response.body.description).toBe(createPatternPayload.description);
      expect(response.body.severity).toBe(createPatternPayload.severity);
      expect(response.body.action).toBe(createPatternPayload.action);
      expect(response.body.isActive).toBe(true);
      expect(response.body.triggerCount).toBe(0);
      expect(Array.isArray(response.body.conditions)).toBe(true);
      expect(response.body.conditions.length).toBe(1);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .send(createPatternPayload)
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send(createPatternPayload)
        .expect(403);
    });

    it('should return 400 for invalid payload (validation failure)', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(invalidCreatePayload)
        .expect(400);
    });

    it('should return 400 when conditions array is missing', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Bad pattern',
          description: 'No conditions',
          severity: 'LOW',
          action: 'FLAG',
        })
        .expect(400);
    });
  });

  describe('GET /v1/admin/fraud-patterns', () => {
    it('should list fraud patterns as admin (happy path)', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(5);

      const first = response.body[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('severity');
      expect(first).toHaveProperty('action');
      expect(first).toHaveProperty('isActive');
      expect(first).toHaveProperty('conditions');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });
  });

  describe('PATCH /v1/admin/fraud-patterns/:id', () => {
    it('should update a fraud pattern as admin (happy path)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(createPatternPayload)
        .expect(201);

      const patternId = createResponse.body.id;
      const updatePayload = {
        name: 'Updated Velocity Pattern',
        severity: 'HIGH' as const,
        action: 'REQUIRE_REVIEW' as const,
      };

      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/fraud-patterns/${patternId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updatePayload)
        .expect(200);

      expect(response.body.id).toBe(patternId);
      expect(response.body.name).toBe(updatePayload.name);
      expect(response.body.severity).toBe(updatePayload.severity);
      expect(response.body.action).toBe(updatePayload.action);
    });

    it('should return 404 when updating non-existent pattern', async () => {
      await request(app.getHttpServer())
        .patch('/v1/admin/fraud-patterns/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'nope' })
        .expect(404);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .patch('/v1/admin/fraud-patterns/some-id')
        .send({ name: 'x' })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(createPatternPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/v1/admin/fraud-patterns/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send({ name: 'x' })
        .expect(403);
    });

    it('should return 400 for invalid update payload (validation failure)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(createPatternPayload)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/v1/admin/fraud-patterns/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ severity: 'NOT_A_SEVERITY' })
        .expect(400);
    });
  });

  describe('DELETE /v1/admin/fraud-patterns/:id', () => {
    it('should deactivate a fraud pattern as admin (happy path)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(createPatternPayload)
        .expect(201);

      const patternId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .delete(`/v1/admin/fraud-patterns/${patternId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.id).toBe(patternId);
      expect(response.body.isActive).toBe(false);
    });

    it('should return 404 when deleting non-existent pattern', async () => {
      await request(app.getHttpServer())
        .delete('/v1/admin/fraud-patterns/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .delete('/v1/admin/fraud-patterns/some-id')
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(createPatternPayload)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/admin/fraud-patterns/${createResponse.body.id}`)
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });
  });

  describe('POST /v1/admin/fraud-patterns/test', () => {
    it('should dry-run a pattern against a scenario (happy path: matches)', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      const highValuePattern = listResponse.body.find(
        (p: any) => p.name === 'High-value new account',
      );
      if (!highValuePattern) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          patternId: highValuePattern.id,
          transactionScenario: {
            amountUsd: 10000,
            accountAgeDays: 2,
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('matched');
      expect(response.body.matched).toBe(true);
      expect(Array.isArray(response.body.conditions)).toBe(true);
      expect(
        response.body.conditions.every((c: any) => c.result === true),
      ).toBe(true);
    });

    it('should dry-run a pattern against a scenario (happy path: no match)', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      const highValuePattern = listResponse.body.find(
        (p: any) => p.name === 'High-value new account',
      );
      if (!highValuePattern) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          patternId: highValuePattern.id,
          transactionScenario: {
            amountUsd: 100,
            accountAgeDays: 30,
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('matched');
      expect(response.body.matched).toBe(false);
    });

    it('should return 404 when testing non-existent pattern', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          patternId: '00000000-0000-0000-0000-000000000000',
          transactionScenario: { amountUsd: 100 },
        })
        .expect(404);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .send({
          patternId: 'some-id',
          transactionScenario: {},
        })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      const pattern = listResponse.body[0];
      if (!pattern) return;

      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send({
          patternId: pattern.id,
          transactionScenario: { amountUsd: 100 },
        })
        .expect(403);
    });

    it('should return 400 when patternId is missing (validation failure)', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          transactionScenario: { amountUsd: 100 },
        })
        .expect(400);
    });
  });

  describe('Access Control', () => {
    it('should deny all fraud-patterns endpoints without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .expect(401);

      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .send(createPatternPayload)
        .expect(401);

      await request(app.getHttpServer())
        .patch('/v1/admin/fraud-patterns/some-id')
        .send({ name: 'x' })
        .expect(401);

      await request(app.getHttpServer())
        .delete('/v1/admin/fraud-patterns/some-id')
        .expect(401);

      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .send({ patternId: 'x', transactionScenario: {} })
        .expect(401);
    });

    it('should deny all fraud-patterns endpoints to non-admin with 403', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send(createPatternPayload)
        .expect(403);

      await request(app.getHttpServer())
        .patch('/v1/admin/fraud-patterns/some-id')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send({ name: 'x' })
        .expect(403);

      await request(app.getHttpServer())
        .delete('/v1/admin/fraud-patterns/some-id')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/v1/admin/fraud-patterns/test')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send({ patternId: 'x', transactionScenario: {} })
        .expect(403);
    });
  });
});
