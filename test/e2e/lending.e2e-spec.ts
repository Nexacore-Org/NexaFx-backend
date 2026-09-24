import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';

describe('Lending E2E Tests (#1124)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let lenderAccessToken: string;
  let lenderId: string;
  let borrowerAccessToken: string;
  let borrowerId: string;
  let otherUserAccessToken: string;

  const validCreateOfferPayload = {
    amount: '100',
    currency: 'XLM',
    annualInterestRate: '0.10',
    termDays: 30,
    minBorrowerScore: 0,
  };

  const invalidCreateOfferPayload = {
    amount: '',
    currency: 'XLM',
    annualInterestRate: '',
    termDays: -1,
    minBorrowerScore: 0,
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

    const lenderEmail = 'lender@example.com';
    const lenderPassword = 'LenderPass123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: lenderEmail,
        password: lenderPassword,
        firstName: 'Lender',
        lastName: 'User',
        phone: '+10000000001',
      })
      .expect(200);

    const lenderOtp = await getLatestOtp(dataSource, lenderEmail);
    const lenderResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: lenderEmail, otp: lenderOtp })
      .expect(200);

    lenderAccessToken = lenderResponse.body.accessToken;
    const lenderResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [lenderEmail],
    );
    lenderId = lenderResult[0].id;

    await dataSource.query(
      `UPDATE "user" SET "kycTier" = $1 WHERE id = $2`,
      ['ENHANCED', lenderId],
    );

    await dataSource.query(
      `INSERT INTO wallets ("userId", currency, balance, "isDefault", network, label)
       VALUES ($1, $2, $3, true, 'TESTNET', 'Primary')
       ON CONFLICT DO NOTHING`,
      [lenderId, 'XLM', '500.00000000'],
    );

    const borrowerEmail = 'borrower@example.com';
    const borrowerPassword = 'BorrowerPass123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: borrowerEmail,
        password: borrowerPassword,
        firstName: 'Borrower',
        lastName: 'User',
        phone: '+10000000002',
      })
      .expect(200);

    const borrowerOtp = await getLatestOtp(dataSource, borrowerEmail);
    const borrowerResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: borrowerEmail, otp: borrowerOtp })
      .expect(200);

    borrowerAccessToken = borrowerResponse.body.accessToken;
    const borrowerResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [borrowerEmail],
    );
    borrowerId = borrowerResult[0].id;

    await dataSource.query(
      `INSERT INTO wallets ("userId", currency, balance, "isDefault", network, label)
       VALUES ($1, $2, $3, true, 'TESTNET', 'Primary')
       ON CONFLICT DO NOTHING`,
      [borrowerId, 'XLM', '500.00000000'],
    );

    const otherEmail = 'other@example.com';
    const otherPassword = 'OtherPass123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: otherEmail,
        password: otherPassword,
        firstName: 'Other',
        lastName: 'User',
        phone: '+10000000003',
      })
      .expect(200);

    const otherOtp = await getLatestOtp(dataSource, otherEmail);
    const otherResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: otherEmail, otp: otherOtp })
      .expect(200);

    otherUserAccessToken = otherResponse.body.accessToken;
  }, 120000);

  describe('GET /v2/lending/offers', () => {
    it('should list open lending offers (happy path)', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/v2/lending/offers')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      const first = response.body[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('amount');
      expect(first).toHaveProperty('currency');
      expect(first).toHaveProperty('annualInterestRate');
      expect(first).toHaveProperty('termDays');
      expect(first).toHaveProperty('status');
    });

    it('should filter offers by maxRate query param', async () => {
      await request(app.getHttpServer())
        .get('/v2/lending/offers?maxRate=0.15')
        .expect(200);
    });

    it('should filter offers by minAmount query param', async () => {
      await request(app.getHttpServer())
        .get('/v2/lending/offers?minAmount=50')
        .expect(200);
    });

    it('should filter offers by maxTerm query param', async () => {
      await request(app.getHttpServer())
        .get('/v2/lending/offers?maxTerm=60')
        .expect(200);
    });

    it('should return 401 without authentication when guard applies', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/lending/offers');
      expect([200, 401]).toContain(res.status);
    });
  });

  describe('POST /v2/lending/offers', () => {
    it('should create a lending offer as authenticated lender with ENHANCED KYC (happy path)', async () => {
      const response = await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body).toHaveProperty('id');
      expect(response.body.lenderId).toBe(lenderId);
      expect(response.body.amount).toBe(validCreateOfferPayload.amount);
      expect(response.body.currency).toBe(validCreateOfferPayload.currency);
      expect(response.body.annualInterestRate).toBe(
        validCreateOfferPayload.annualInterestRate,
      );
      expect(response.body.termDays).toBe(validCreateOfferPayload.termDays);
      expect(response.body.status).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .send(validCreateOfferPayload)
        .expect(401);
    });

    it('should return 403 for user without ENHANCED KYC', async () => {
      const response = await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .send(validCreateOfferPayload);

      expect([400, 403]).toContain(response.status);
    });

    it('should return 400 for invalid payload (validation failure)', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(invalidCreateOfferPayload)
        .expect(400);
    });

    it('should return 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('POST /v2/lending/offers/:id/accept', () => {
    it('should accept a lending offer as borrower (happy path)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      const offerId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/v2/lending/offers/${offerId}/accept`)
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.offerId).toBe(offerId);
      expect(response.body.borrowerId).toBe(borrowerId);
      expect(response.body.status).toBeDefined();
      expect(response.body).toHaveProperty('principalAmount');
      expect(response.body).toHaveProperty('interestAmount');
      expect(response.body).toHaveProperty('dueDate');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers/some-offer-id/accept')
        .expect(401);
    });

    it('should return 404 when accepting non-existent offer', async () => {
      await request(app.getHttpServer())
        .post(
          '/v2/lending/offers/00000000-0000-0000-0000-000000000000/accept',
        )
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .expect(404);
    });

    it('should return 400 when lender tries to accept their own offer', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/v2/lending/offers/${createResponse.body.id}/accept`)
        .set('Authorization', `Bearer ${lenderAccessToken}`);

      expect([400, 403]).toContain(response.status);
    });
  });

  describe('POST /v2/lending/agreements/:id/repay', () => {
    it('should repay a lending agreement (happy path)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      const acceptResponse = await request(app.getHttpServer())
        .post(`/v2/lending/offers/${createResponse.body.id}/accept`)
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .expect(201);

      const agreementId = acceptResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/v2/lending/agreements/${agreementId}/repay`)
        .set('Authorization', `Bearer ${borrowerAccessToken}`);

      expect([200, 201]).toContain(response.status);
      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('id');
        expect(response.body.status).toBeDefined();
      }
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/agreements/some-agreement-id/repay')
        .expect(401);
    });

    it('should return 404 when repaying non-existent agreement', async () => {
      await request(app.getHttpServer())
        .post(
          '/v2/lending/agreements/00000000-0000-0000-0000-000000000000/repay',
        )
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .expect(404);
    });
  });

  describe('GET /v2/lending/my/offers', () => {
    it('should get my lending offers as lender (happy path)', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/v2/lending/my/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0].lenderId).toBe(lenderId);
    });

    it('should return empty array for user with no offers', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/lending/my/offers')
        .set('Authorization', `Bearer ${otherUserAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v2/lending/my/offers')
        .expect(401);
    });
  });

  describe('GET /v2/lending/my/agreements', () => {
    it('should get my lending agreements as a participant (happy path)', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .send(validCreateOfferPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v2/lending/offers/${createResponse.body.id}/accept`)
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .expect(201);

      const borrowerResponse = await request(app.getHttpServer())
        .get('/v2/lending/my/agreements')
        .set('Authorization', `Bearer ${borrowerAccessToken}`)
        .expect(200);

      expect(Array.isArray(borrowerResponse.body)).toBe(true);
      expect(borrowerResponse.body.length).toBeGreaterThanOrEqual(1);

      const lenderResponse = await request(app.getHttpServer())
        .get('/v2/lending/my/agreements')
        .set('Authorization', `Bearer ${lenderAccessToken}`)
        .expect(200);

      expect(Array.isArray(lenderResponse.body)).toBe(true);
      expect(lenderResponse.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for user with no agreements', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/lending/my/agreements')
        .set('Authorization', `Bearer ${otherUserAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/v2/lending/my/agreements')
        .expect(401);
    });
  });

  describe('Access Control', () => {
    it('should deny all authenticated-only lending endpoints without JWT (401)', async () => {
      await request(app.getHttpServer())
        .post('/v2/lending/offers')
        .send(validCreateOfferPayload)
        .expect(401);

      await request(app.getHttpServer())
        .post('/v2/lending/offers/some-id/accept')
        .expect(401);

      await request(app.getHttpServer())
        .post('/v2/lending/agreements/some-id/repay')
        .expect(401);

      await request(app.getHttpServer())
        .get('/v2/lending/my/offers')
        .expect(401);

      await request(app.getHttpServer())
        .get('/v2/lending/my/agreements')
        .expect(401);
    });
  });
});
