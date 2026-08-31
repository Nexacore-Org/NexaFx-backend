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

describe('Escrow Lifecycle E2E Tests (#965)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let senderToken: string;
  let senderId: string;
  let recipientToken: string;
  let recipientId: string;
  let thirdPartyToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    // Create sender user
    const senderEmail = 'sender-escrow@example.com';
    const senderPassword = 'SenderPass123!';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: senderEmail,
        password: senderPassword,
        firstName: 'Sender',
        lastName: 'User',
        phone: '+1111111111',
      })
      .expect(200);

    const senderOtp = await getLatestOtp(dataSource, senderEmail);
    const senderResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: senderEmail, otp: senderOtp })
      .expect(200);

    senderToken = senderResponse.body.accessToken;
    const senderResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [senderEmail],
    );
    senderId = senderResult[0].id;

    // Create recipient user
    const recipientEmail = 'recipient-escrow@example.com';
    const recipientPassword = 'RecipientPass123!';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: recipientEmail,
        password: recipientPassword,
        firstName: 'Recipient',
        lastName: 'User',
        phone: '+2222222222',
      })
      .expect(200);

    const recipientOtp = await getLatestOtp(dataSource, recipientEmail);
    const recipientResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: recipientEmail, otp: recipientOtp })
      .expect(200);

    recipientToken = recipientResponse.body.accessToken;
    const recipientResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [recipientEmail],
    );
    recipientId = recipientResult[0].id;

    // Give sender some balance
    await dataSource.query(`UPDATE "user" SET balances = $1 WHERE id = $2`, [
      JSON.stringify({ XLM: 1000 }),
      senderId,
    ]);

    // Create third-party user
    const thirdEmail = 'thirdparty@example.com';
    const thirdPassword = 'ThirdParty123!';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: thirdEmail,
        password: thirdPassword,
        firstName: 'Third',
        lastName: 'Party',
        phone: '+3333333333',
      })
      .expect(200);

    const thirdOtp = await getLatestOtp(dataSource, thirdEmail);
    const thirdResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email: thirdEmail, otp: thirdOtp })
      .expect(200);

    thirdPartyToken = thirdResponse.body.accessToken;
  }, 60000);

  describe('Creating an escrow', () => {
    it('creates an escrow agreement between two users', async () => {
      const response = await request(app.getHttpServer())
        .post('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientEmail: 'recipient-escrow@example.com',
          amount: 100,
          currency: 'XLM',
          title: 'Website development',
          description: 'Milestone 1 payment',
          releaseCondition: 'Design delivered',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('PENDING');
      expect(response.body.senderId).toBe(senderId);
      expect(response.body.recipientId).toBe(recipientId);
      expect(response.body.amount).toBe('100.00000000');
    });

    it('rejects escrow with non-existent recipient', async () => {
      await request(app.getHttpServer())
        .post('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientEmail: 'nobody@example.com',
          amount: 100,
          currency: 'XLM',
          title: 'Test',
          description: 'Test',
          releaseCondition: 'Test',
        })
        .expect(404);
    });
  });

  describe('Funding an escrow', () => {
    let escrowId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientEmail: 'recipient-escrow@example.com',
          amount: 50,
          currency: 'XLM',
          title: 'Test escrow',
          description: 'For testing',
          releaseCondition: 'Complete work',
        });
      escrowId = createResponse.body.id;
    });

    it('sender can fund a pending escrow', async () => {
      const response = await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/fund`)
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(201);

      expect(response.body.status).toBe('FUNDED');
      expect(response.body.stellarEscrowPublicKey).toBeTruthy();
      expect(response.body.fundedTxHash).toBeTruthy();
    });

    it('recipient cannot fund escrow (only sender can)', async () => {
      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/fund`)
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(403);
    });

    it('third party cannot fund escrow', async () => {
      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/fund`)
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(403);
    });
  });

  describe('Releasing an escrow', () => {
    let escrowId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientEmail: 'recipient-escrow@example.com',
          amount: 25,
          currency: 'XLM',
          title: 'Release test',
          description: 'For release testing',
          releaseCondition: 'Work done',
        });
      escrowId = createResponse.body.id;

      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/fund`)
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(201);
    });

    it('sender can release funded escrow to recipient', async () => {
      const response = await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/release`)
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(201);

      expect(response.body.status).toBe('RELEASED');
      expect(response.body.releaseTxHash).toBeTruthy();
    });

    it('third party cannot release escrow they are not party to', async () => {
      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/release`)
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(403);
    });
  });

  describe('Disputing an escrow', () => {
    let escrowId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientEmail: 'recipient-escrow@example.com',
          amount: 75,
          currency: 'XLM',
          title: 'Dispute test',
          description: 'For dispute testing',
          releaseCondition: 'Deliver code',
        });
      escrowId = createResponse.body.id;

      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/fund`)
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(201);
    });

    it('recipient can dispute a funded escrow', async () => {
      const response = await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/dispute`)
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(201);

      expect(response.body.status).toBe('DISPUTED');
    });

    it('third party cannot dispute escrow they are not party to', async () => {
      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/dispute`)
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(403);
    });

    it('disputed escrow routes to resolution mechanism', async () => {
      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/dispute`)
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(201);

      // Attempt to release should fail for non-admin as status is DISPUTED
      await request(app.getHttpServer())
        .post(`/escrow/${escrowId}/release`)
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(400); // Bad request - not in funded state
    });
  });

  describe('Access control', () => {
    it('unauthenticated users cannot access escrow endpoints', async () => {
      await request(app.getHttpServer()).get('/escrow').expect(401);
    });

    it('users can only see escrows they are party to', async () => {
      // Create escrow between sender and recipient
      const createResponse = await request(app.getHttpServer())
        .post('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({
          recipientEmail: 'recipient-escrow@example.com',
          amount: 10,
          currency: 'XLM',
          title: 'Access test',
          description: 'For access testing',
          releaseCondition: 'Deliver',
        });

      // Sender can see their escrows
      const senderEscrows = await request(app.getHttpServer())
        .get('/escrow')
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(200);

      expect(senderEscrows.body.length).toBeGreaterThan(0);

      // Recipient can also see escrows they are in
      const recipientEscrows = await request(app.getHttpServer())
        .get('/escrow')
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);

      expect(recipientEscrows.body.length).toBeGreaterThan(0);

      // Third party sees no escrows
      const thirdEscrows = await request(app.getHttpServer())
        .get('/escrow')
        .set('Authorization', `Bearer ${thirdPartyToken}`)
        .expect(200);

      expect(thirdEscrows.body).toHaveLength(0);
    });
  });
});
