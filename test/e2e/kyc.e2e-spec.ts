import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, seedTestUser, seedAdminUser, getLatestOtp, setupTestDatabase } from '../helpers/db.helper';

describe('KYC E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userAccessToken: string;
  let adminAccessToken: string;
  let userId: string;
  let adminId: string;

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
    // Truncate database before each test
    await truncateAll(dataSource);

    // Create and authenticate regular user
    const email = 'kyc-user@example.com';
    const password = 'KycUserPassword123!';

    // Sign up user
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password,
        firstName: 'KYC',
        lastName: 'User',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    const signupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);

    userAccessToken = signupResponse.body.accessToken;

    // Get user ID from database
    const userResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [email],
    );
    userId = userResult[0].id;

    // Create and authenticate admin user
    const adminEmail = 'kyc-admin@example.com';
    const adminPassword = 'KycAdminPassword123!';

    // Sign up admin
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: adminEmail,
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'User',
        phone: '+0987654321',
      })
      .expect(200);

    const adminOtp = await getLatestOtp(dataSource, adminEmail);
    const adminSignupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: adminEmail, otp: adminOtp })
      .expect(200);

    adminAccessToken = adminSignupResponse.body.accessToken;

    // Update admin user to have ADMIN role
    const adminResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [adminEmail],
    );
    adminId = adminResult[0].id;

    await dataSource.query(
      `UPDATE "user" SET role = $1 WHERE id = $2`,
      ['ADMIN', adminId],
    );
  });

  describe('POST /kyc/apply', () => {
    it('should submit KYC with valid files', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id-front.pdf'), 'id-front.pdf')
        .attach('governmentIdBack', Buffer.from('fake-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('fake-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('PENDING');
    });

    it('should reject oversized file with 400', async () => {
      // Create a very large buffer (e.g., 50MB)
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024);

      const response = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', largeBuffer, 'large-file.pdf');

      expect([400, 413, 422]).toContain(response.status);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .expect(401);
    });
  });

  describe('GET /kyc/status', () => {
    it('should return KYC status for user', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('currentTier');
      expect(response.body).toHaveProperty('application');
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .expect(401);
    });
  });

  describe('POST /admin/kyc/approve', () => {
    it('should approve KYC and update user status', async () => {
      // First, submit KYC
      const kycResponse = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .attach('governmentIdBack', Buffer.from('fake-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('fake-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      const applicationId = kycResponse.body.id;

      // Admin approves KYC
      const response = await request(app.getHttpServer())
        .post(`/v1/admin/kyc/${applicationId}/approve`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('APPROVED');

      // Verify user's KYC status is updated
      const statusResponse = await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200);

      expect(statusResponse.body.currentTier).toBe('STANDARD');
    });

    it('should require admin role', async () => {
      // Submit KYC first
      const kycResponse = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .attach('governmentIdBack', Buffer.from('fake-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('fake-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      const applicationId = kycResponse.body.id;

      // Regular user tries to approve (should fail)
      await request(app.getHttpServer())
        .post(`/v1/admin/kyc/${applicationId}/approve`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({})
        .expect(403);
    });
  });

  describe('POST /admin/kyc/reject', () => {
    it('should reject KYC and set RESUBMISSION_REQUIRED status', async () => {
      // Submit KYC
      const kycResponse = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .attach('governmentIdBack', Buffer.from('fake-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('fake-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      const applicationId = kycResponse.body.id;

      // Admin rejects KYC
      const response = await request(app.getHttpServer())
        .post(`/v1/admin/kyc/${applicationId}/reject`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          reason: 'Document quality too low',
        })
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('REJECTED');

      // Verify user's KYC status is updated
      const statusResponse = await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200);

      expect(statusResponse.body.application?.status).toBe('RESUBMISSION_REQUIRED');
    });

    it('should require reason for rejection', async () => {
      // Submit KYC
      const kycResponse = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .attach('governmentIdBack', Buffer.from('fake-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('fake-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      const applicationId = kycResponse.body.id;

      // Try to reject without reason
      await request(app.getHttpServer())
        .post(`/v1/admin/kyc/${applicationId}/reject`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('POST /kyc/resubmit', () => {
    it('should resubmit KYC after rejection', async () => {
      // Submit initial KYC
      const kycResponse = await request(app.getHttpServer())
        .post('/v1/kyc/apply')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .attach('governmentIdBack', Buffer.from('fake-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('fake-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      const applicationId = kycResponse.body.id;

      // Admin rejects
      await request(app.getHttpServer())
        .post(`/v1/admin/kyc/${applicationId}/reject`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ reason: 'Resubmit with better quality' })
        .expect(200);

      // User resubmits
      const resubmitResponse = await request(app.getHttpServer())
        .post(`/v1/kyc/resubmit/${applicationId}`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('better-id.pdf'), 'id-front.pdf')
        .attach('governmentIdBack', Buffer.from('better-id-back.pdf'), 'id-back.pdf')
        .attach('selfie', Buffer.from('better-selfie.jpg'), 'selfie.jpg')
        .expect(201);

      expect(resubmitResponse.body).toHaveProperty('status');
      expect(resubmitResponse.body.status).toBe('PENDING');
    });

    it('should reject resubmission if not rejected first', async () => {
      // Try to resubmit without prior rejection
      await request(app.getHttpServer())
        .post('/v1/kyc/resubmit/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/kyc/resubmit/00000000-0000-0000-0000-000000000000')
        .field('targetTier', 'STANDARD')
        .attach('governmentIdFront', Buffer.from('fake-id.pdf'), 'id.pdf')
        .expect(401);
    });
  });
});
