import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  getLatestOtp,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';
import {
  ActivityFeedItem,
  ActivityFeedType,
} from '../../src/unified-activity-feed/entities/activity-feed-item.entity';

describe('Unified Activity Feed E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
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

    const email = 'unified-feed-user@example.com';
    const password = 'SecurePassword123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password,
        firstName: 'Unified',
        lastName: 'Feed',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    expect(otp).toBeTruthy();

    const authResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);

    accessToken = authResponse.body.accessToken;

    const userRow = await dataSource.query(
      'SELECT id FROM "users" WHERE email = $1 LIMIT 1',
      [email],
    );
    userId = userRow[0]?.id;
    expect(userId).toBeTruthy();
  });

  it('should return the authenticated user activity feed', async () => {
    await dataSource.getRepository(ActivityFeedItem).insert([
      {
        userId,
        type: ActivityFeedType.TRANSACTION_COMPLETE,
        referenceId: 'transaction-1',
        referenceType: 'transaction',
      },
      {
        userId,
        type: ActivityFeedType.KYC_DECISION,
        referenceId: 'kyc-1',
        referenceType: 'kyc',
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/v2/unified-activity-feed')
      .query({ limit: '2' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0]).toMatchObject({
      userId,
      type: ActivityFeedType.TRANSACTION_COMPLETE,
      referenceId: 'transaction-1',
      referenceType: 'transaction',
    });
    expect(response.body).toHaveProperty('nextCursor');
  });

  it('should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/v2/unified-activity-feed')
      .expect(401);
  });

  it('should return an empty feed when the user has no activity items', async () => {
    const response = await request(app.getHttpServer())
      .get('/v2/unified-activity-feed')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      items: [],
      nextCursor: null,
    });
  });
});
