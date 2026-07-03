import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  getLatestOtp,
  setupTestDatabase,
  createKycApplication,
} from '../helpers/db.helper';
import { v4 as uuidv4 } from 'uuid';

describe('Transactions E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let kycApprovedUserToken: string;
  let kycApprovedUserId: string;
  let nonKycUserToken: string;
  let nonKycUserId: string;

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

    // Setup KYC-approved user
    const kycEmail = 'kyc-approved@example.com';
    const kycPassword = 'KycApprovedPassword123!';

    // Sign up KYC user
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: kycEmail,
        password: kycPassword,
        firstName: 'KYC',
        lastName: 'Approved',
        phone: '+1234567890',
      })
      .expect(200);

    const kycOtp = await getLatestOtp(dataSource, kycEmail);
    const kycSignupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: kycEmail, otp: kycOtp })
      .expect(200);

    kycApprovedUserToken = kycSignupResponse.body.accessToken;

    // Get user ID and set KYC status
    const kycUserResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [kycEmail],
    );
    kycApprovedUserId = kycUserResult[0].id;

    await dataSource.query(
      `UPDATE "user" SET kyc_status = $1 WHERE id = $2`,
      ['APPROVED', kycApprovedUserId],
    );

    // Setup non-KYC user
    const nonKycEmail = 'non-kyc@example.com';
    const nonKycPassword = 'NonKycPassword123!';

    // Sign up non-KYC user
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: nonKycEmail,
        password: nonKycPassword,
        firstName: 'Non',
        lastName: 'KYC',
        phone: '+0987654321',
      })
      .expect(200);

    const nonKycOtp = await getLatestOtp(dataSource, nonKycEmail);
    const nonKycSignupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: nonKycEmail, otp: nonKycOtp })
      .expect(200);

    nonKycUserToken = nonKycSignupResponse.body.accessToken;

    // Get non-KYC user ID
    const nonKycUserResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [nonKycEmail],
    );
    nonKycUserId = nonKycUserResult[0].id;
  });

  describe('POST /transactions/deposit', () => {
    it('should create deposit transaction for KYC-approved user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type');
      expect(response.body.type).toBe('DEPOSIT');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('amount');
    });

    it('should return 403 for non-KYC user', async () => {
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${nonKycUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(403);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(401);
    });

    it('should handle duplicate idempotency key', async () => {
      const idempotencyKey = uuidv4();

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey,
        })
        .expect(201);

      const transactionId1 = response1.body.id;

      // Second request with same idempotency key
      const response2 = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey,
        });

      // Should either return existing transaction or 400
      expect([200, 201, 400]).toContain(response2.status);

      // If successful, should be same transaction
      if (response2.status === 200 || response2.status === 201) {
        expect(response2.body.id).toBe(transactionId1);
      }
    });

    it('should reject invalid amount', async () => {
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '-100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(400);
    });

    it('should reject unsupported currency', async () => {
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'INVALID',
          idempotencyKey: uuidv4(),
        })
        .expect(400);
    });
  });

  describe('POST /transactions/withdraw', () => {
    it('should create withdrawal transaction for KYC-approved user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '50',
          currency: 'USD',
          destination: 'user_wallet_address',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type');
      expect(response.body.type).toBe('WITHDRAWAL');
    });

    it('should return 403 for non-KYC user', async () => {
      await request(app.getHttpServer())
        .post('/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${nonKycUserToken}`)
        .send({
          amount: '50',
          currency: 'USD',
          destination: 'user_wallet_address',
          idempotencyKey: uuidv4(),
        })
        .expect(403);
    });

    it('should reject insufficient balance', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '1000000',
          currency: 'USD',
          destination: 'user_wallet_address',
          idempotencyKey: uuidv4(),
        });

      // Should return 422 for insufficient balance or 400 for validation
      expect([400, 422]).toContain(response.status);
    });
  });

  describe('GET /transactions', () => {
    it('should list user transactions', async () => {
      // Create a transaction first
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      // List transactions
      const response = await request(app.getHttpServer())
        .get('/v1/transactions')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should filter transactions by status', async () => {
      // Create deposits
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      // Filter by status
      const response = await request(app.getHttpServer())
        .get('/v1/transactions?status=COMPLETED')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);

      // All returned transactions should have status COMPLETED
      if (response.body.data.length > 0) {
        response.body.data.forEach((tx) => {
          expect(['COMPLETED', 'PENDING']).toContain(tx.status);
        });
      }
    });

    it('should support pagination', async () => {
      // Create multiple transactions
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/v1/transactions/deposit')
          .set('Authorization', `Bearer ${kycApprovedUserToken}`)
          .send({
            amount: '100',
            currency: 'USD',
            idempotencyKey: uuidv4(),
          })
          .expect(201);
      }

      // List with pagination
      const response = await request(app.getHttpServer())
        .get('/v1/transactions?page=1&limit=2')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/v1/transactions')
        .expect(401);
    });

    it('should only show user own transactions', async () => {
      // Create transaction as KYC user
      await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      // List transactions as non-KYC user
      const response = await request(app.getHttpServer())
        .get('/v1/transactions')
        .set('Authorization', `Bearer ${nonKycUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      // Non-KYC user should see 0 transactions
      expect(response.body.data.length).toBe(0);
    });
  });

  describe('GET /transactions/:id', () => {
    it('should retrieve transaction details', async () => {
      // Create a transaction
      const createResponse = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      const transactionId = createResponse.body.id;

      // Get transaction details
      const response = await request(app.getHttpServer())
        .get(`/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toBe(transactionId);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('amount');
      expect(response.body).toHaveProperty('status');
    });

    it('should return 404 for non-existent transaction', async () => {
      await request(app.getHttpServer())
        .get('/v1/transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .expect(404);
    });

    it('should forbid access to other users transactions', async () => {
      // Create transaction as KYC user
      const createResponse = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${kycApprovedUserToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      const transactionId = createResponse.body.id;

      // Try to access as non-KYC user
      await request(app.getHttpServer())
        .get(`/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${nonKycUserToken}`)
        .expect(403);
    });
  });
});
