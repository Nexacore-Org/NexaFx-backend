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

describe('Super Admin E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let superAdminAccessToken: string;
  let regularAdminAccessToken: string;
  let managedAdminId: string;

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

    const superAdminEmail = 'superadmin@example.com';
    const superAdminPassword = 'SuperAdminPassword123!';
    // Role SUPER_ADMIN
    await seedTestUser(dataSource, {
      email: superAdminEmail,
      password: superAdminPassword,
      role: 'SUPER_ADMIN',
    });

    const superAdminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: superAdminEmail, password: superAdminPassword });
    superAdminAccessToken = superAdminLogin.body.data.accessToken;

    const adminEmail = 'admin@example.com';
    const adminPassword = 'AdminPassword123!';
    const adminUser = await seedAdminUser(dataSource, {
      email: adminEmail,
      password: adminPassword,
    });
    managedAdminId = adminUser.id; // for PATCH/DELETE tests

    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    regularAdminAccessToken = adminLogin.body.data.accessToken;
  });

  describe('POST /v1/super-admin/admins', () => {
    it('should allow SUPER_ADMIN to create a new managed admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/super-admin/admins')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          email: 'newadmin@example.com',
          password: 'NewAdminPassword123!',
          firstName: 'New',
          lastName: 'Admin',
          role: 'ADMIN',
        })
        .expect(201);

      expect(response.body.data.email).toBe('newadmin@example.com');
      expect(response.body.data.role).toBe('ADMIN');
    });

    it('should reject requests from regular admins (403)', async () => {
      await request(app.getHttpServer())
        .post('/v1/super-admin/admins')
        .set('Authorization', `Bearer ${regularAdminAccessToken}`)
        .send({
          email: 'another@example.com',
          password: 'PassWord123!',
        })
        .expect(403);
    });

    it('should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/v1/super-admin/admins')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ email: 'not-an-email', password: 'ValidPassword123!' })
        .expect(400);
    });
  });

  describe('PATCH /v1/super-admin/admins/:id/role', () => {
    it('should allow SUPER_ADMIN to update an admin role', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/super-admin/admins/${managedAdminId}/role`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ role: 'SUPER_ADMIN' })
        .expect(200);

      expect(response.body.data.role).toBe('SUPER_ADMIN');
    });
  });

  describe('DELETE /v1/super-admin/admins/:id', () => {
    it('should allow SUPER_ADMIN to delete an admin', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/super-admin/admins/${managedAdminId}`)
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200); // Or 204 depending on implementation, but typically we return { message: ... }
    });
  });

  describe('GET /v1/super-admin/audit-logs', () => {
    it('should allow SUPER_ADMIN to retrieve audit logs', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/super-admin/audit-logs')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });
  });

  describe('PATCH /v1/super-admin/platform/config', () => {
    it('should allow SUPER_ADMIN to update platform config', async () => {
      const response = await request(app.getHttpServer())
        .patch('/v1/super-admin/platform/config')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({ maintenanceMode: true })
        .expect(200);

      // Verify success
      expect(response.body).toHaveProperty('data');
    });
  });
});
