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
import { RateAlert } from '../../src/rate-alerts/entities/rate-alert.entity';

describe('Rate Alerts Enhancement E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let user: User;
  let rateAlert: RateAlert;

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

    rateAlert = await dataSource.manager.save(RateAlert, {
      userId: user.id,
      baseAsset: 'USD',
      quoteAsset: 'EUR',
      targetRate: 1.2,
      type: 'PERCENT_CHANGE',
      percentChange: 5,
    });
  });

  describe('POST /v2/rate-alerts-enhancement/check-percent-change', () => {
    it('should manually trigger percentage-change alert evaluation', async () => {
      await request(app.getHttpServer())
        .post('/v2/rate-alerts-enhancement/check-percent-change')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .post('/v2/rate-alerts-enhancement/check-percent-change')
        .expect(401);
    });
  });

  describe('POST /v2/rate-alerts-enhancement/:id/set-baseline', () => {
    it('should set the baseline rate for a percentage-change alert', async () => {
      await request(app.getHttpServer())
        .post(`/v2/rate-alerts-enhancement/${rateAlert.id}/set-baseline`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
        })
        .expect(201);
    });

    it('should return 400 for invalid data', async () => {
      await request(app.getHttpServer())
        .post(`/v2/rate-alerts-enhancement/${rateAlert.id}/set-baseline`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fromCurrency: 'USD',
        })
        .expect(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .post(`/v2/rate-alerts-enhancement/${rateAlert.id}/set-baseline`)
        .send({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
        })
        .expect(401);
    });
  });
});
