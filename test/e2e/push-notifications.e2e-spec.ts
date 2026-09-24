import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  seedAdminUser,
  setupTestDatabase,
} from '../helpers/db.helper';

describe('Push Notifications E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let regularUserAccessToken: string;
  let createdBroadcastId: string;

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

    const adminEmail = 'admin@example.com';
    const adminPassword = 'AdminPassword123!';
    await seedAdminUser(dataSource, {
      email: adminEmail,
      password: adminPassword,
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(201); // login usually returns 201 or 200, let's just use 200/201 based on typical nestjs (POST default is 201).

    // Auth login endpoint in Nest returns 201 by default unless overriden. Let's see what admin.e2e-spec.ts used. Wait, I will adjust this.
    adminAccessToken = adminLogin.body.data.accessToken;

    const userEmail = 'user@example.com';
    const userPassword = 'UserPassword123!';
    await seedTestUser(dataSource, {
      email: userEmail,
      password: userPassword,
    });

    const userLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password: userPassword });
    regularUserAccessToken = userLogin.body.data.accessToken;
  });

  describe('POST /v1/admin/push-notifications', () => {
    it('should allow admin to create a broadcast', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          title: 'Test Broadcast',
          message: 'This is a test broadcast',
          type: 'INFO',
          data: { link: 'https://example.com' },
        })
        .expect(201);

      expect(response.body.data.title).toBe('Test Broadcast');
      createdBroadcastId = response.body.data.id;
    });

    it('should return 400 for invalid data', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ title: '' }) // missing required fields
        .expect(400);
    });

    it('should reject unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .send({ title: 'Test', message: 'Test message', type: 'INFO' })
        .expect(401);
    });

    it('should reject unauthorized requests (403 for non-admins)', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send({ title: 'Test', message: 'Test message', type: 'INFO' })
        .expect(403);
    });
  });

  describe('GET /v1/admin/push-notifications', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ title: 'Test', message: 'Test message', type: 'INFO' });
      createdBroadcastId = response.body.data.id;
    });

    it('should return a paginated list of broadcasts', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.items.length).toBeGreaterThan(0);
    });

    it('should retrieve a specific broadcast by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/admin/push-notifications/${createdBroadcastId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(createdBroadcastId);
    });
  });

  describe('PATCH /v1/admin/push-notifications/:id/deactivate', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          title: 'To Deactivate',
          message: 'Deactivate me',
          type: 'INFO',
        });
      createdBroadcastId = response.body.data.id;
    });

    it('should deactivate a broadcast', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/push-notifications/${createdBroadcastId}/deactivate`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.data.status).toBe('INACTIVE');
    });
  });

  describe('PATCH /v1/admin/push-notifications/bulk/deactivate', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/admin/push-notifications')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ title: 'Bulk', message: 'Deactivate me', type: 'INFO' });
      createdBroadcastId = response.body.data.id;
    });

    it('should bulk deactivate broadcasts', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/admin/push-notifications/bulk/deactivate')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ ids: [createdBroadcastId] })
        .expect(200);

      expect(response.body.data.deactivated).toBe(1);
    });
  });
});
