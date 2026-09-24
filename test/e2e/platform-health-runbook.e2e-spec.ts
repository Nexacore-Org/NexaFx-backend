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

describe('Platform Health Runbook E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminAccessToken: string;
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

    const adminEmail = 'admin@example.com';
    const adminPassword = 'AdminPassword123!';
    await seedAdminUser(dataSource, {
      email: adminEmail,
      password: adminPassword,
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword });
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

  describe('GET /v1/v2/platform-health-runbook/snapshot', () => {
    it('should retrieve a platform health snapshot for ADMIN', async () => {
      // Due to nesting default version 1 with an explicit v2 in the path, it is routed at /v1/v2/...
      const response = await request(app.getHttpServer())
        .get('/v1/v2/platform-health-runbook/snapshot')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      if (response.status === 404) {
        // Fallback check if it maps without global v1 prefix
        const fallbackResponse = await request(app.getHttpServer())
          .get('/v2/platform-health-runbook/snapshot')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(200);
        expect(fallbackResponse.body).toHaveProperty('data');
      } else {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
      }
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/v1/v2/platform-health-runbook/snapshot')
        .expect(401);
    });

    it('should reject unauthorized requests (403 for non-admins)', async () => {
      await request(app.getHttpServer())
        .get('/v1/v2/platform-health-runbook/snapshot')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });
  });
});
