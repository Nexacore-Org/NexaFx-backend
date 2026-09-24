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

describe('Rate Alerts E2E Tests', () => {
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

  describe('POST /rate-alerts', () => {
    it('should create a new rate alert', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          baseAsset: 'USD',
          quoteAsset: 'EUR',
          targetRate: 0.9,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('baseAsset', 'USD');
      expect(response.body).toHaveProperty('quoteAsset', 'EUR');
      expect(response.body).toHaveProperty('targetRate', 0.9);
    });

    it('should return 400 for invalid data', async () => {
      await request(app.getHttpServer())
        .post('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          baseAsset: 'USD',
        })
        .expect(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .post('/v1/rate-alerts')
        .send({
          baseAsset: 'USD',
          quoteAsset: 'EUR',
          targetRate: 0.9,
        })
        .expect(401);
    });
  });

  describe('GET /rate-alerts', () => {
    it('should get all alerts for authenticated user', async () => {
      await request(app.getHttpServer())
        .post('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          baseAsset: 'USD',
          quoteAsset: 'EUR',
          targetRate: 0.9,
        });

      const response = await request(app.getHttpServer())
        .get('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0]).toHaveProperty('baseAsset', 'USD');
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer()).get('/v1/rate-alerts').expect(401);
    });
  });

  describe('PATCH /rate-alerts/:id/reset', () => {
    it('should reset a triggered rate alert', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          baseAsset: 'USD',
          quoteAsset: 'EUR',
          targetRate: 0.9,
        });

      const alertId = createResponse.body.id;

      await dataSource.manager.update(RateAlert, alertId, {
        triggeredAt: new Date(),
        notifiedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .patch(`/v1/rate-alerts/${alertId}/reset`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('triggeredAt', null);
      expect(response.body).toHaveProperty('notifiedAt', null);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .patch('/v1/rate-alerts/some-id/reset')
        .expect(401);
    });
  });

  describe('DELETE /rate-alerts/:id', () => {
    it('should delete a rate alert', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          baseAsset: 'USD',
          quoteAsset: 'EUR',
          targetRate: 0.9,
        });

      const alertId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/v1/rate-alerts/${alertId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const getResponse = await request(app.getHttpServer())
        .get('/v1/rate-alerts')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getResponse.body.length).toBe(0);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .delete('/v1/rate-alerts/some-id')
        .expect(401);
    });
  });
});
