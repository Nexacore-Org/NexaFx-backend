import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  seedAdminUser,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';
import { UserFactory } from '../mocks/factories';

describe('Search E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let regularUserAccessToken: string;
  let regularUser: any;

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
    await seedAdminUser(app, dataSource, adminEmail, adminPassword);
    const adminLoginResponse = await request(app.getHttpServer())
      .post('/v1/auth/signin')
      .send({ email: adminEmail, password: adminPassword });
    adminAccessToken = adminLoginResponse.body.accessToken;

    const userEmail = 'user@example.com';
    const userPassword = 'UserPassword123!';
    regularUser = await seedTestUser(app, dataSource, userEmail, userPassword);
    const userLoginResponse = await request(app.getHttpServer())
      .post('/v1/auth/signin')
      .send({ email: userEmail, password: userPassword });
    regularUserAccessToken = userLoginResponse.body.accessToken;
  });

  describe('GET /v2/search', () => {
    it('should return grouped search results for an authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/search?q=test')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('tickets');
    });

    it('should return 401 for an unauthenticated user', async () => {
      await request(app.getHttpServer()).get('/v2/search?q=test').expect(401);
    });

    it('should return empty results when query is empty', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/search?q=')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        transactions: [],
        notifications: [],
        tickets: [],
      });
    });
  });

  describe('GET /admin/search', () => {
    it('should return admin search results for an admin user', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/search?q=test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('auditLogs');
    });

    it('should return 403 for a non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/admin/search?q=test')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });

    it('should return 401 for an unauthenticated user', async () => {
      await request(app.getHttpServer())
        .get('/admin/search?q=test')
        .expect(401);
    });

    it('should return empty results when query is empty', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/search?q=')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        users: [],
        transactions: [],
        auditLogs: [],
      });
    });
  });
});
