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
import { RebalancingPolicy } from '../../src/rebalancing/entities/rebalancing-policy.entity';

describe('Rebalancing E2E Tests', () => {
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

  describe('GET /v2/portfolio/rebalancing', () => {
    it('should get the rebalancing policy', async () => {
      await dataSource.manager.save(RebalancingPolicy, {
        userId: user.id,
        allocations: [{ asset: 'BTC', percentage: 100 }],
        frequency: 'MONTHLY',
      });

      const response = await request(app.getHttpServer())
        .get('/v2/portfolio/rebalancing')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('allocations');
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .get('/v2/portfolio/rebalancing')
        .expect(401);
    });
  });

  describe('PUT /v2/portfolio/rebalancing', () => {
    it('should create or update the rebalancing policy', async () => {
      const response = await request(app.getHttpServer())
        .put('/v2/portfolio/rebalancing')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          allocations: [{ asset: 'BTC', percentage: 100 }],
          frequency: 'MONTHLY',
        })
        .expect(200);

      expect(response.body).toHaveProperty('allocations');
    });

    it('should return 400 for invalid data', async () => {
      await request(app.getHttpServer())
        .put('/v2/portfolio/rebalancing')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          allocations: [{ asset: 'BTC', percentage: 110 }],
          frequency: 'MONTHLY',
        })
        .expect(400);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .put('/v2/portfolio/rebalancing')
        .send({
          allocations: [{ asset: 'BTC', percentage: 100 }],
          frequency: 'MONTHLY',
        })
        .expect(401);
    });
  });

  describe('DELETE /v2/portfolio/rebalancing', () => {
    it('should deactivate the rebalancing policy', async () => {
      await dataSource.manager.save(RebalancingPolicy, {
        userId: user.id,
        allocations: [{ asset: 'BTC', percentage: 100 }],
        frequency: 'MONTHLY',
      });

      await request(app.getHttpServer())
        .delete('/v2/portfolio/rebalancing')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .delete('/v2/portfolio/rebalancing')
        .expect(401);
    });
  });

  describe('GET /v2/portfolio/rebalancing/preview', () => {
    it('should get a preview of the rebalancing trades', async () => {
      await request(app.getHttpServer())
        .get('/v2/portfolio/rebalancing/preview')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .get('/v2/portfolio/rebalancing/preview')
        .expect(401);
    });
  });

  describe('POST /v2/portfolio/rebalancing/execute', () => {
    it('should execute the rebalancing trades', async () => {
      await request(app.getHttpServer())
        .post('/v2/portfolio/rebalancing/execute')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
    });

    it('should return 401 for unauthenticated user', async () => {
      await request(app.getHttpServer())
        .post('/v2/portfolio/rebalancing/execute')
        .expect(401);
    });
  });
});
