import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedAdminUser,
  setupTestDatabase,
} from '../helpers/db.helper';

describe('Security E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let superAdminAccessToken: string;
  let regularUserAccessToken: string;

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

    // Seed a super admin user
    const superAdminEmail = 'superadmin@example.com';
    const superAdminPassword = 'SuperAdminPassword123!';
    await seedAdminUser(
      app,
      dataSource,
      superAdminEmail,
      superAdminPassword,
      'SUPER_ADMIN',
    );
    const superAdminLoginResponse = await request(app.getHttpServer())
      .post('/v1/auth/signin')
      .send({ email: superAdminEmail, password: superAdminPassword });
    superAdminAccessToken = superAdminLoginResponse.body.accessToken;

    // Seed a regular user
    const userEmail = 'user@example.com';
    const userPassword = 'UserPassword123!';
    const regularUserResponse = await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: userEmail,
        password: userPassword,
        firstName: 'Regular',
        lastName: 'User',
        phone: '+1234567890',
      });
    regularUserAccessToken = regularUserResponse.body.accessToken;
  });

  describe('GET /admin/security/canary-tokens', () => {
    it('should return a list of canary tokens for a super admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/security/canary-tokens')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 403 for a non-super-admin user', async () => {
      await request(app.getHttpServer())
        .get('/admin/security/canary-tokens')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });

    it('should return 401 for an unauthenticated user', async () => {
      await request(app.getHttpServer())
        .get('/admin/security/canary-tokens')
        .expect(401);
    });
  });
});
