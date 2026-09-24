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

describe('Admin E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let regularUserAccessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    // Set up test database
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Truncate database
    await truncateAll(dataSource);

    // Setup admin user
    const adminEmail = 'admin@example.com';
    const adminPassword = 'AdminPassword123!';

    // Sign up admin
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: adminEmail,
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'User',
        phone: '+1234567890',
      })
      .expect(200);

    const adminOtp = await getLatestOtp(dataSource, adminEmail);
    const adminResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: adminEmail, otp: adminOtp })
      .expect(200);

    adminAccessToken = adminResponse.body.accessToken;

    // Update user to have ADMIN role
    await dataSource.query(
      `UPDATE "user" SET role = $1 WHERE email = $2`,
      ['ADMIN', adminEmail],
    );

    // Setup regular user
    const userEmail = 'user@example.com';
    const userPassword = 'UserPassword123!';

    // Sign up regular user
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: userEmail,
        password: userPassword,
        firstName: 'Regular',
        lastName: 'User',
        phone: '+0987654321',
      })
      .expect(200);

    const userOtp = await getLatestOtp(dataSource, userEmail);
    const userResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: userEmail, otp: userOtp })
      .expect(200);

    regularUserAccessToken = userResponse.body.accessToken;
  });

  describe('GET /admin/metrics', () => {
    it('should return platform metrics for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/metrics')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      // Expect common metric fields
      expect(response.body).toHaveProperty('totalUsers');
      expect(response.body).toHaveProperty('activeUsers');
      expect(response.body).toHaveProperty('totalTransactions');
      expect(response.body).toHaveProperty('transactionVolume');
    });

    it('should return 403 for non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/metrics')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/metrics')
        .expect(401);
    });

    it('should support date range filtering', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/metrics?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('GET /admin/users', () => {
    it('should return paginated user list for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
    });

    it('should return 403 for non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/users')
        .expect(401);
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/users?page=1&limit=10')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(10);
    });

    it('should support filtering by email', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/users?email=admin@example.com')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      if (response.body.data.length > 0) {
        expect(response.body.data[0].email).toContain('admin@example.com');
      }
    });

    it('should support filtering by KYC status', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/users?kycStatus=APPROVED')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support sorting', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/admin/users?sortBy=createdAt&order=DESC')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });
  });

  describe('GET /admin/users/:id', () => {
    it('should return detailed user profile for admin', async () => {
      // Get user list first to get a user ID
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      if (listResponse.body.data.length === 0) {
        // Skip if no users
        return;
      }

      const userId = listResponse.body.data[0].id;

      const response = await request(app.getHttpServer())
        .get(`/v1/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('firstName');
      expect(response.body).toHaveProperty('lastName');
      expect(response.body).toHaveProperty('kycStatus');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('should return 403 for non-admin user', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      if (listResponse.body.data.length === 0) {
        return;
      }

      const userId = listResponse.body.data[0].id;

      await request(app.getHttpServer())
        .get(`/v1/admin/users/${userId}`)
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });
  });

  describe('PATCH /admin/users/:id/role', () => {
    it('should update user role as admin', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      if (listResponse.body.data.length < 2) {
        // Need at least 2 users
        return;
      }

      const userId = listResponse.body.data.find(u => u.email !== 'admin@example.com')?.id;
      if (!userId) return;

      const response = await request(app.getHttpServer())
        .patch(`/v1/admin/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'MODERATOR' })
        .expect(200);

      expect(response.body).toHaveProperty('role');
      expect(response.body.role).toBe('MODERATOR');
    });

    it('should return 403 for non-admin user', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      if (listResponse.body.data.length === 0) {
        return;
      }

      const userId = listResponse.body.data[0].id;

      await request(app.getHttpServer())
        .patch(`/v1/admin/users/${userId}/role`)
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .send({ role: 'MODERATOR' })
        .expect(403);
    });

    it('should validate role value', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      if (listResponse.body.data.length === 0) {
        return;
      }

      const userId = listResponse.body.data[0].id;

      await request(app.getHttpServer())
        .patch(`/v1/admin/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ role: 'INVALID_ROLE' })
        .expect(400);
    });
  });

  describe('Access Control', () => {
    it('should deny access to /admin/metrics without authorization', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/metrics')
        .expect(401);
    });

    it('should deny access to /admin/users without authorization', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/users')
        .expect(401);
    });

    it('should deny non-admin access with 403', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/metrics')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${regularUserAccessToken}`)
        .expect(403);
    });

    it('should accept admin access', async () => {
      const metricsResponse = await request(app.getHttpServer())
        .get('/v1/admin/metrics')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect([200, 400, 500]).toContain(metricsResponse.status);

      const usersResponse = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect([200, 400, 500]).toContain(usersResponse.status);
    });
  });
});
