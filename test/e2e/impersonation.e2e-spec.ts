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

/**
 * E2E coverage for the impersonation restrictions.
 *
 * Regression guard: ImpersonationRestrictionGuard existed but was never
 * registered, so an admin running under an impersonation session could
 * change the user's password, disable their 2FA and request a GDPR export
 * or deletion. The guard is now an APP_GUARD and the sensitive routes are
 * marked with @BlockDuringImpersonation().
 */
describe('Impersonation restrictions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;

  let impersonationToken: string;
  let normalToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const user = await seedTestUser(dataSource, {
      email: 'impersonated@example.com',
      password: 'Password123!',
      role: 'USER',
    });

    impersonationToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: 'USER',
      isImpersonation: true,
      impersonatedBy: 'admin-uuid-1',
    });
    normalToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: 'USER',
    });
  });

  describe('impersonation session', () => {
    it('cannot change the password', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({ currentPassword: 'Password123!', newPassword: 'NewPassword123!' });

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

    it('cannot delete the impersonated account via DELETE /users/me', async () => {
      const res = await request(app.getHttpServer())
        .delete('/v1/users/me')
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(res.status).toBe(403);
    });

    it('cannot download a GDPR data export', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/v1/users/me/data-export/00000000-0000-0000-0000-000000000000/download',
        )
        .set('Authorization', `Bearer ${impersonationToken}`);

      expect(res.status).toBe(403);
    });

    it('cannot register a device token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/users/device-token')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({ token: 'impersonation-device-token' });

      expect(res.status).toBe(403);
    });

    it('cannot remove a device token', async () => {
      const res = await request(app.getHttpServer())
        .delete('/v1/users/device-token')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({ token: 'impersonation-device-token' });

      expect(res.status).toBe(403);
    });

    it('cannot update an FCM token', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/users/me/fcm-token')
        .set('Authorization', `Bearer ${impersonationToken}`)
        .send({ fcmToken: 'impersonation-fcm-token' });

      expect(res.status).toBe(403);
    });

    it('cannot log out all devices', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout-all')
        .set('Authorization', `Bearer ${impersonationToken}`);

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

  describe('normal session', () => {
    it('reaches the change-password route', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Authorization', `Bearer ${normalToken}`)
        .send({ currentPassword: 'Password123!', newPassword: 'NewPassword123!' });

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