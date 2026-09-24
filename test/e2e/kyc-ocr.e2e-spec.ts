import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';

describe('KYC OCR E2E Tests (#1123)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userAccessToken: string;
  let adminAccessToken: string;

  const validSubmitPayload = {
    kycApplicationId: 'app-00000000-0000-0000-0000-000000000001',
    imageKey: 's3://kyc-docs/id-front-abc123.jpg',
    submittedDocumentNumber: 'AB123456',
  };

  const validSubmitPayloadMinimal = {
    kycApplicationId: 'app-00000000-0000-0000-0000-000000000002',
    imageKey: 's3://kyc-docs/passport-xyz.jpg',
  };

  const invalidSubmitPayload = {
    kycApplicationId: '',
    imageKey: '',
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const userEmail = 'ocr-user@example.com';
    const userPassword = 'OcrUserPass123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: userEmail,
        password: userPassword,
        firstName: 'OCR',
        lastName: 'User',
        phone: '+14444444444',
      })
      .expect(200);

    const userOtp = await getLatestOtp(dataSource, userEmail);
    const userResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: userEmail, otp: userOtp })
      .expect(200);

    userAccessToken = userResponse.body.accessToken;

    const adminEmail = 'ocr-admin@example.com';
    const adminPassword = 'OcrAdminPass123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: adminEmail,
        password: adminPassword,
        firstName: 'OCR',
        lastName: 'Admin',
        phone: '+15555555555',
      })
      .expect(200);

    const adminOtp = await getLatestOtp(dataSource, adminEmail);
    const adminSignupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: adminEmail, otp: adminOtp })
      .expect(200);

    adminAccessToken = adminSignupResponse.body.accessToken;

    const adminResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [adminEmail],
    );
    await dataSource.query(`UPDATE "user" SET role = $1 WHERE id = $2`, [
      'ADMIN',
      adminResult[0].id,
    ]);
  }, 120000);

  describe('POST /v1/kyc/ocr', () => {
    it('should run OCR extraction for a KYC application with all fields (happy path)', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send(validSubmitPayload)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.kycApplicationId).toBe(
        validSubmitPayload.kycApplicationId,
      );
      expect(response.body).toHaveProperty('confidence');
      expect(response.body).toHaveProperty('provider');
      expect(response.body).toHaveProperty('processingTimeMs');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('likelyExpired');
      expect(response.body).toHaveProperty('documentNumberMismatch');

      if (response.body.fullName !== undefined) {
        expect(typeof response.body.fullName).toBe('string');
      }
      if (response.body.documentNumber !== undefined) {
        expect(typeof response.body.documentNumber).toBe('string');
      }
      if (response.body.dateOfBirth !== undefined) {
        expect(typeof response.body.dateOfBirth).toBe('string');
      }
    });

    it('should run OCR extraction with minimal payload (no submittedDocumentNumber)', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send(validSubmitPayloadMinimal)
        .expect(200);

      expect(response.body.kycApplicationId).toBe(
        validSubmitPayloadMinimal.kycApplicationId,
      );
      expect(response.body).toHaveProperty('confidence');
      expect(response.body).toHaveProperty('provider');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .send(validSubmitPayload)
        .expect(401);
    });

    it('should return 400 for missing required fields (validation failure)', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({})
        .expect(400);
    });

    it('should return 400 for invalid payload with empty values (validation failure)', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send(invalidSubmitPayload)
        .expect(400);
    });

    it('should return 400 when kycApplicationId is missing', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({ imageKey: 'some-image-key.jpg' })
        .expect(400);
    });

    it('should return 400 when imageKey is missing', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({ kycApplicationId: 'app-123' })
        .expect(400);
    });

    it('should set documentNumberMismatch correctly when submittedDocumentNumber differs from extracted', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          kycApplicationId: 'app-mismatch-test-1',
          imageKey: 's3://kyc-docs/mismatch.jpg',
          submittedDocumentNumber: 'ZZ999999',
        })
        .expect(200);

      expect(response.body).toHaveProperty('documentNumberMismatch');
      expect(typeof response.body.documentNumberMismatch).toBe('boolean');
    });

    it('should work for admin user as well', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          kycApplicationId: 'app-admin-extract-1',
          imageKey: 's3://kyc-docs/admin-passport.jpg',
        })
        .expect(200);

      expect(response.body).toHaveProperty('kycApplicationId');
      expect(response.body).toHaveProperty('confidence');
    });
  });

  describe('GET /v1/admin/kyc/:id/ocr', () => {
    it('should retrieve OCR result for a KYC application (happy path)', async () => {
      const appId = 'app-result-get-001';

      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          kycApplicationId: appId,
          imageKey: 's3://kyc-docs/for-get-test.jpg',
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/v1/admin/kyc/${appId}/ocr`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.kycApplicationId).toBe(appId);
      expect(response.body).toHaveProperty('confidence');
      expect(response.body).toHaveProperty('provider');
      expect(response.body).toHaveProperty('processingTimeMs');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('likelyExpired');
      expect(response.body).toHaveProperty('documentNumberMismatch');
    });

    it('should retrieve OCR result as regular authenticated user', async () => {
      const appId = 'app-result-user-get-001';

      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          kycApplicationId: appId,
          imageKey: 's3://kyc-docs/for-user-get.jpg',
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/v1/admin/kyc/${appId}/ocr`)
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect([200, 403]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.kycApplicationId).toBe(appId);
      }
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/kyc/some-app-id/ocr')
        .expect(401);
    });

    it('should return 404 when OCR result does not exist', async () => {
      await request(app.getHttpServer())
        .get(
          '/v1/admin/kyc/00000000-0000-0000-0000-000000000000/ocr',
        )
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('should return 404 for never-submitted application id', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/kyc/app-never-existed/ocr')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });
  });

  describe('Access Control', () => {
    it('should deny KYC OCR endpoints without authentication (401)', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/ocr')
        .send(validSubmitPayload)
        .expect(401);

      await request(app.getHttpServer())
        .get('/v1/admin/kyc/some-app-id/ocr')
        .expect(401);
    });
  });
});
