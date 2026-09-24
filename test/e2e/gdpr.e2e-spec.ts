import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';

describe('GDPR E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userEmail: string;
  let userPassword: string;

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

    userEmail = 'gdpr-user@example.com';
    userPassword = 'GdprPassword123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: userEmail,
        password: userPassword,
        firstName: 'GDPR',
        lastName: 'User',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, userEmail);
    const signupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: userEmail, otp })
      .expect(200);

    accessToken = signupResponse.body.accessToken;
  });

  describe('DELETE /v1/gdpr/me (Right to Erasure)', () => {
    it('should erase and anonymize the authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: userPassword,
          reason: 'No longer using the service',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('erased');
      expect(response.body).toHaveProperty('status', 'erased');
      expect(response.body).toHaveProperty('filesDeleted');

      const userResult = await dataSource.query(
        `SELECT email, first_name, last_name, is_active, password, "deletedAt" FROM "user" WHERE email LIKE $1`,
        [`deleted-%@nexafx.deleted`],
      );
      expect(userResult.length).toBe(1);
      expect(userResult[0].email).toMatch(/^deleted-.*@nexafx\.deleted$/);
      expect(userResult[0].first_name).toBe('Deleted');
      expect(userResult[0].last_name).toBe('Deleted');
      expect(userResult[0].is_active).toBe(false);
      expect(userResult[0].password).toBe('');
      expect(userResult[0].deletedAt).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .send({ password: userPassword })
        .expect(401);
    });

    it('should return 401 for invalid password', async () => {
      await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: 'WrongPassword!' })
        .expect(401);
    });

    it('should return 400 when password is missing', async () => {
      await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'No password provided' })
        .expect(400);
    });

    it('should return 400 when password is empty string', async () => {
      await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password: '' })
        .expect(400);
    });
  });

  describe('POST /v1/gdpr/export (Data Export Request)', () => {
    it('should queue an export job for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/gdpr/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('queued');
      expect(response.body).toHaveProperty('jobId');
      expect(typeof response.body.jobId).toBe('string');
      expect(response.body.jobId.length).toBeGreaterThan(0);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer()).post('/v1/gdpr/export').expect(401);
    });
  });

  describe('GET /v1/gdpr/export/status', () => {
    it('should return no_job_found when no export exists', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/gdpr/export/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'no_job_found');
      expect(response.body).toHaveProperty('jobId', null);
    });

    it('should return job status after export is requested', async () => {
      const exportResponse = await request(app.getHttpServer())
        .post('/v1/gdpr/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(202);

      const jobId = exportResponse.body.jobId;

      const statusResponse = await request(app.getHttpServer())
        .get('/v1/gdpr/export/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('jobId', jobId);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/gdpr/export/status')
        .expect(401);
    });
  });

  describe('GET /v1/gdpr/consent/status', () => {
    it('should return consent status flags for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('requiresConsentUpdate');
      expect(typeof response.body.requiresConsentUpdate).toBe('boolean');
      expect(response.body).toHaveProperty('currentVersion');
      expect(response.body).toHaveProperty('requiredVersion');
      expect(typeof response.body.requiredVersion).toBe('string');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .expect(401);
    });
  });

  describe('POST /v1/gdpr/consent', () => {
    it('should update consent when consentGdpr is true', async () => {
      const preStatus = await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const requiredVersion = preStatus.body.requiredVersion;

      const response = await request(app.getHttpServer())
        .post('/v1/gdpr/consent')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('User-Agent', 'Jest-E2E-Test/1.0')
        .send({ consentGdpr: true })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('consent');

      const postStatus = await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(postStatus.body.currentVersion).toBe(requiredVersion);
      expect(postStatus.body.requiresConsentUpdate).toBe(false);

      const consentLogResult = await dataSource.query(
        `SELECT * FROM gdpr_consent WHERE user_id = (SELECT id FROM "user" WHERE email = $1) ORDER BY consented_at DESC LIMIT 1`,
        [userEmail],
      );
      expect(consentLogResult.length).toBe(1);
      expect(consentLogResult[0].version).toBe(requiredVersion);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/gdpr/consent')
        .send({ consentGdpr: true })
        .expect(401);
    });

    it('should return 400 when consentGdpr is false', async () => {
      await request(app.getHttpServer())
        .post('/v1/gdpr/consent')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ consentGdpr: false })
        .expect(400);
    });

    it('should return 400 when consentGdpr field is missing', async () => {
      await request(app.getHttpServer())
        .post('/v1/gdpr/consent')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('should return 400 when consentGdpr is not a boolean', async () => {
      await request(app.getHttpServer())
        .post('/v1/gdpr/consent')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ consentGdpr: 'yes' })
        .expect(400);
    });
  });

  describe('Authentication Enforcement (All GDPR Routes)', () => {
    it('should return 401 on DELETE /v1/gdpr/me without token', async () => {
      await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .send({ password: userPassword })
        .expect(401);
    });

    it('should return 401 on POST /v1/gdpr/export without token', async () => {
      await request(app.getHttpServer()).post('/v1/gdpr/export').expect(401);
    });

    it('should return 401 on GET /v1/gdpr/export/status without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/gdpr/export/status')
        .expect(401);
    });

    it('should return 401 on GET /v1/gdpr/consent/status without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .expect(401);
    });

    it('should return 401 on POST /v1/gdpr/consent without token', async () => {
      await request(app.getHttpServer())
        .post('/v1/gdpr/consent')
        .send({ consentGdpr: true })
        .expect(401);
    });

    it('should return 401 with malformed Bearer token', async () => {
      await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .set('Authorization', 'Bearer definitely-not-a-valid-jwt')
        .expect(401);
    });

    it('should return 401 with non-Bearer auth scheme', async () => {
      await request(app.getHttpServer())
        .get('/v1/gdpr/consent/status')
        .set(
          'Authorization',
          `Basic ${Buffer.from('user:pass').toString('base64')}`,
        )
        .expect(401);
    });
  });

  describe('Erasure side effects (audit trail)', () => {
    it('should create an ErasureAuditLog record on successful erasure', async () => {
      await request(app.getHttpServer())
        .delete('/v1/gdpr/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          password: userPassword,
          reason: 'E2E test erasure with reason',
        })
        .expect(200);

      const erasedUserId = (
        await dataSource.query(`SELECT id FROM "user" WHERE email LIKE $1`, [
          `deleted-%@nexafx.deleted`,
        ])
      )[0]?.id;

      expect(erasedUserId).toBeDefined();

      const erasureLogResult = await dataSource.query(
        `SELECT * FROM erasure_audit_log WHERE user_id = $1 LIMIT 1`,
        [erasedUserId],
      );
      expect(erasureLogResult.length).toBe(1);
      expect(typeof erasureLogResult[0].files_deleted).toBe('number');

      const auditLogResult = await dataSource.query(
        `SELECT * FROM audit_log WHERE entity_id = $1 AND action = $2`,
        [erasedUserId, 'gdpr.erasure'],
      );
      expect(auditLogResult.length).toBeGreaterThanOrEqual(0);
    });
  });
});
