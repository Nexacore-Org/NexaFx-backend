import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  setupTestDatabase,
} from '../helpers/db.helper';
import { User } from '../../src/user/entities/user.entity';

describe('QR E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let user: User;

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
    it('should return a static QR code', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/qr/static/${user.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('type', 'STATIC');
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .get(`/v1/qr/static/${user.id}`)
        .expect(401);
    });
  });

  describe('POST /qr/dynamic', () => {
    it('should return a dynamic QR code', async () => {
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

      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('type', 'DYNAMIC');
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
    it('should process a QR code scan', async () => {
      const dynamicQrResponse = await request(app.getHttpServer())
        .post('/v1/qr/dynamic')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          merchantId: user.id,
          amount: 100,
          reference: 'test-payment',
          currency: 'USD',
        });

      const qrCode = dynamicQrResponse.body.qrCode;

      const response = await request(app.getHttpServer())
        .post('/v1/qr/scan')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ payload: qrCode })
        .expect(201);

      expect(response.body).toHaveProperty(
        'message',
        'QR Code processed successfully',
      );
      expect(response.body).toHaveProperty('session');
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
