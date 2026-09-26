import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import { setupTestDatabase, teardownTestDatabase, cleanDatabase } from '../helpers/db.helper';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../../src/modules/users/entities/user.entity';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';
import * as bcrypt from 'bcrypt';

/**
 * E2E coverage for super-admin privilege boundaries.
 *
 * Exercises the real NestJS module graph (guards, pipes, controllers) against a
 * real test database. Only true external boundaries are mocked via app.helper.
 */
describe('SuperAdmin privilege boundaries (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let superAdminToken: string;
  let adminUser: User;
  let superAdminUser: User;

  const password = 'Password123!';

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource);

    const hash = await bcrypt.hash(password, 10);

    adminUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: 'admin@example.com',
        password: hash,
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        isActive: true,
        isEmailVerified: true,
      }),
    );

    superAdminUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: 'superadmin@example.com',
        password: hash,
        firstName: 'Super',
        lastName: 'Admin',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        isEmailVerified: true,
      }),
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: adminUser.email, password })
      .expect(HttpStatus.OK);
    adminToken = adminLogin.body.data.accessToken;

    const superAdminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: superAdminUser.email, password })
      .expect(HttpStatus.OK);
    superAdminToken = superAdminLogin.body.data.accessToken;
  });

  describe('platform config update (SUPER_ADMIN only)', () => {
    it('rejects an ADMIN-role user with 403', async () => {
      await request(app.getHttpServer())
        .patch('/v1/super-admin/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: 'maintenance_mode', value: true })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('allows a SUPER_ADMIN to update platform config', async () => {
      await request(app.getHttpServer())
        .patch('/v1/super-admin/config')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ key: 'maintenance_mode', value: true })
        .expect(HttpStatus.OK);
    });
  });

  describe('admin lifecycle management', () => {
    it('lets a SUPER_ADMIN create and then demote an ADMIN user', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/v1/super-admin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'newadmin@example.com',
          password,
          firstName: 'New',
          lastName: 'Admin',
        })
        .expect(HttpStatus.CREATED);

      const createdId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/v1/super-admin/admins/${createdId}/demote`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(HttpStatus.OK);

      // The demoted user's role change must take effect on their next request.
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'newadmin@example.com', password })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .patch('/v1/super-admin/config')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({ key: 'maintenance_mode', value: true })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('rejects an ADMIN attempting to create an ADMIN user', async () => {
      await request(app.getHttpServer())
        .post('/v1/super-admin/admins')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'sneaky@example.com',
          password,
          firstName: 'Sneaky',
          lastName: 'Admin',
        })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('SUPER_ADMIN role assignment', () => {
    it('rejects an ADMIN attempting to assign the SUPER_ADMIN role', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/super-admin/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.SUPER_ADMIN })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('allows a SUPER_ADMIN to assign the SUPER_ADMIN role', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/super-admin/users/${adminUser.id}/role`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ role: UserRole.SUPER_ADMIN })
        .expect(HttpStatus.OK);
    });
  });

  describe('audit logging', () => {
    it('records SUPER_ADMIN actions with correct role context', async () => {
      await request(app.getHttpServer())
        .patch('/v1/super-admin/config')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ key: 'maintenance_mode', value: true })
        .expect(HttpStatus.OK);

      const logs = await dataSource.getRepository(AuditLog).find({
        where: { actorId: superAdminUser.id },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].actorRole).toBe(UserRole.SUPER_ADMIN);
    });
  });
});
