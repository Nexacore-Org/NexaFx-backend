import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  setupTestDatabase,
} from '../helpers/db.helper';
import { User } from '../../src/users/user.entity';

describe('QR E2E Tests (#1480)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let user: User;

  function unwrap(res: request.Response): any {
    return res.body && res.body.data !== undefined ? res.body.data : res.body;
  }

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
    const { user: testUser, accessToken: testAccessToken } = await seedTestUser(
      dataSource,
      app,
    );
    user = testUser;
    accessToken = testAccessToken;
  });

  describe('GET /qr/static/:merchantId', () => {
    it('should return a signed static QR code', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/qr/static/${user.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = unwrap(response);
      expect(body).toHaveProperty('qrCode');
      expect(body).toHaveProperty('payload');
      expect(body).toHaveProperty('type', 'STATIC');
    });

    it('should return 400 for an unknown merchantId', async () => {
      await request(app.getHttpServer())
        .get('/v1/qr/static/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .get(`/v1/qr/static/${user.id}`)
        .expect(401);
    });
  });

  describe('POST /qr/dynamic', () => {
    it('should return a signed dynamic QR code', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          merchantId: user.id,
          amount: 100,
          reference: 'test-payment',
          currency: 'USD',
        })
        .expect(201);

      const body = unwrap(response);
      expect(body).toHaveProperty('qrCode');
      expect(body).toHaveProperty('payload');
      expect(body).toHaveProperty('type', 'DYNAMIC');
    });

    it('should return 400 for negative amount', async () => {
      await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          merchantId: user.id,
          amount: -25,
          reference: 'test-payment',
          currency: 'USD',
        })
        .expect(400);
    });

    it('should return 400 for invalid data', async () => {
      await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          merchantId: user.id,
          reference: 'test-payment',
        })
        .expect(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .send({
          merchantId: user.id,
          amount: 100,
          reference: 'test-payment',
          currency: 'USD',
        })
        .expect(401);
    });
  });

  describe('POST /qr/scan', () => {
    it('should process a signed QR code scan', async () => {
      const dynamicQrResponse = await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          merchantId: user.id,
          amount: 100,
          reference: 'test-payment',
          currency: 'USD',
        });

      const dynBody = unwrap(dynamicQrResponse);
      const qrCode = dynBody.qrCode;

      const response = await request(app.getHttpServer())
        .post('/v1/qr/scan')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ payload: qrCode })
        .expect(201);

      const scanBody = unwrap(response);
      expect(scanBody).toHaveProperty(
        'message',
        'QR Code processed successfully',
      );
      expect(scanBody).toHaveProperty('session');
    });

    it('should reject a tampered QR payload (modified amount) with 400', async () => {
      const dynamicQrResponse = await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          merchantId: user.id,
          amount: 100,
          reference: 'test-payment',
          currency: 'USD',
        })
        .expect(201);

      const dynBody = unwrap(dynamicQrResponse);
      const parsed = JSON.parse(dynBody.payload);
      parsed.amount = 1; // tamper amount

      await request(app.getHttpServer())
        .post('/v1/qr/scan')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ payload: JSON.stringify(parsed) })
        .expect(400);
    });

    it('should return 400 for invalid payload', async () => {
      await request(app.getHttpServer())
        .post('/v1/qr/scan')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ payload: 'invalid-payload' })
        .expect(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .post('/v1/qr/scan')
        .send({ payload: 'some-payload' })
        .expect(401);
    });
  });
});
