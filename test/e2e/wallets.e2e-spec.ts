import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';
import { v4 as uuidv4 } from 'uuid';

describe('Wallets E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let userId: string;

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

    const email = 'wallet-user@example.com';
    const password = 'WalletPassword123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password,
        firstName: 'Wallet',
        lastName: 'User',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    const signupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);

    userToken = signupResponse.body.accessToken;

    const userResult = await dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [email],
    );
    userId = userResult[0].id;

    await dataSource.query(
      `UPDATE "user" SET kyc_status = $1 WHERE id = $2`,
      ['APPROVED', userId],
    );
  });

  describe('GET /wallets', () => {
    it('should list the user wallets', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/v1/wallets').expect(401);
    });
  });

  describe('POST /wallets', () => {
    it('should generate a second wallet for the user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'Second Wallet' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('publicKey');
    });
  });

  describe('default wallet routing', () => {
    it('routes a deposit with no walletId to the new default wallet', async () => {
      const originalWallets = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const originalDefault = originalWallets.body.find(
        (w: any) => w.isDefault,
      );
      expect(originalDefault).toBeDefined();

      const newWallet = await request(app.getHttpServer())
        .post('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'New Default' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${newWallet.body.id}/default`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const deposit = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      expect(deposit.body.walletId).toBe(newWallet.body.id);
      expect(deposit.body.walletId).not.toBe(originalDefault.id);
    });

    it('routes a deposit with an explicit non-default walletId to that wallet', async () => {
      const wallets = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const nonDefault = wallets.body.find((w: any) => !w.isDefault);
      expect(nonDefault).toBeDefined();

      const deposit = await request(app.getHttpServer())
        .post('/v1/transactions/deposit')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          amount: '100',
          currency: 'USD',
          walletId: nonDefault.id,
          idempotencyKey: uuidv4(),
        })
        .expect(201);

      expect(deposit.body.walletId).toBe(nonDefault.id);
    });
  });

  describe('DELETE /wallets/:id', () => {
    it('rejects deleting the user only wallet', async () => {
      const wallets = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(wallets.body.length).toBe(1);

      await request(app.getHttpServer())
        .delete(`/v1/wallets/${wallets.body[0].id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });
  });

  describe('watch-only wallet withdrawals', () => {
    it('rejects a withdrawal from a watch-only imported wallet with a clear error', async () => {
      const imported = await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          watchOnly: true,
          label: 'Watch Only',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          amount: '10',
          currency: 'USD',
          walletId: imported.body.id,
          destination: 'GDESTINATIONWALLETADDRESS000000000000000000000000000',
          idempotencyKey: uuidv4(),
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(JSON.stringify(response.body).toLowerCase()).toContain(
        'watch',
      );
    });
  });
});
