import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  getLatestOtp,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';
import { VolumeFeeTier } from '../../src/volume-fee-tiers/entities/volume-fee-tier.entity';

describe('Volume Fee Tiers E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;

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

    const email = 'volume-fee-tiers-user@example.com';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password: 'SecurePassword123!',
        firstName: 'Volume',
        lastName: 'Tiers',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    expect(otp).toBeTruthy();
    const response = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);
    accessToken = response.body.accessToken;
  });

  it('returns active fee tiers to an authenticated user', async () => {
    await dataSource.getRepository(VolumeFeeTier).insert([
      {
        name: 'Silver',
        minVolume30dUsd: '1000',
        sendFeePercent: '0.0100',
        exchangeFeePercent: '0.0200',
        maxSendFee: '10',
        isActive: true,
      },
      {
        name: 'Inactive',
        minVolume30dUsd: '0',
        sendFeePercent: '0.0300',
        exchangeFeePercent: '0.0400',
        maxSendFee: null,
        isActive: false,
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/fee-tiers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ name: 'Silver', isActive: true });
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/v1/admin/fee-tiers').expect(401);
  });
});
