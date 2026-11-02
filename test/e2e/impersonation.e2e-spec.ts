import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import {
  seedTestUser,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';
import { RedisService } from '../../src/common/services/redis.service';
import { User, UserRole } from '../../src/users/user.entity';

/**
 * E2E coverage for the impersonation restrictions and session lifecycle (#1488).
 */
describe('Impersonation restrictions and session lifecycle (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let redisService: RedisService;

  let adminUser: User;
  let targetUser: User;
  let sessionJti: string;
  let impersonationToken: string;
  let normalToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    redisService = app.get(RedisService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    adminUser = await seedTestUser(dataSource, {
      email: 'admin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
    });

    targetUser = await seedTestUser(dataSource, {
      email: 'impersonated@example.com',
      password: 'Password123!',
      role: 'USER',
    });

    sessionJti = 'e2e-impersonation-jti-1';

    await redisService.set(
      `nexafx:impersonation:${targetUser.id}:${sessionJti}`,
      {
        adminId: adminUser.id,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        jti: sessionJti,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      1800,
    );

    impersonationToken = jwt.sign({
      sub: targetUser.id,
      email: targetUser.email,
      role: 'USER',
      isImpersonation: true,
      impersonatedBy: adminUser.id,
      jti: sessionJti,
    });
    normalToken = jwt.sign({
      sub: targetUser.id,
      email: targetUser.email,
      role: 'USER',
    });
  });

  describe('impersonation session restrictions', () => {
    it('cannot change the password', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword123!',
        });

      expect(res.status).toBe(403);
    });

    it('cannot disable two-factor authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/two-factor/disable')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({ totpCode: '123456' });

      expect(res.status).toBe(403);
    });

    it('cannot request a GDPR data export', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/users/me/data-export')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('cannot request account deletion', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/users/me/delete-account')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('cannot unlink an OAuth account', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/oauth/unlink')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({ provider: 'google' });

      expect(res.status).toBe(403);
    });

    it('cannot reach admin routes', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(res.status).toBe(403);
    });

    it('can still read the profile it is impersonating', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(res.status).not.toBe(403);
    });
  });

  describe('impersonation session revocation (#1488)', () => {
    it('rejects an impersonation token with 401 after POST /v1/admin/impersonate/end', async () => {
      const endRes = await request(app.getHttpServer())
        .post('/v1/admin/impersonate/end')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(endRes.status).toBe(200);

      const afterRes = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(afterRes.status).toBe(401);
    });

    it('rejects an impersonation token with 401 after the Redis session expires', async () => {
      await redisService.del(
        `nexafx:impersonation:${targetUser.id}:${sessionJti}`,
      );

      const res = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(res.status).toBe(401);
    });

    it('rejects an impersonation token with 401 after the impersonating admin is demoted', async () => {
      await dataSource
        .getRepository(User)
        .update({ id: adminUser.id }, { role: UserRole.USER });

      const res = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(res.status).toBe(401);
    });

    it('returns 400 when POST /v1/admin/impersonate/end is called with a regular access token', async () => {
      const adminNormalToken = jwt.sign({
        sub: adminUser.id,
        email: adminUser.email,
        role: 'ADMIN',
      });

      const res = await request(app.getHttpServer())
        .post('/v1/admin/impersonate/end')
        .set('Authorization', `Bearer ${adminNormalToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('normal session', () => {
    it('reaches the change-password route', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Authorization', `Bearer ${normalToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword123!',
        });

      expect(res.status).not.toBe(403);
    });

    it('reaches the two-factor status route', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/two-factor/status')
        .set('Authorization', `Bearer ${normalToken}`);

      expect(res.status).not.toBe(403);
    });
  });
});
