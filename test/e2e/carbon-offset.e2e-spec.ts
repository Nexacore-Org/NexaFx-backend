import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import { getLatestOtp, setupTestDatabase, truncateAll } from '../helpers/db.helper';
import { CarbonOffsetRecord } from '../../src/carbon-offset/entities/carbon-offset-record.entity';

describe('Carbon offset E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await truncateAll(dataSource);
    const email = 'carbon-user@example.com';
    await request(app.getHttpServer()).post('/v1/auth/signup').send({
      email,
      password: 'UserPassword123!',
      firstName: 'Carbon',
      lastName: 'User',
      phone: '+12345678003',
    }).expect(200);
    const otp = await getLatestOtp(dataSource, email);
    const auth = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp').send({ email, otp }).expect(200);
    token = auth.body.accessToken;
    const users = await dataSource.query('SELECT id FROM "users" WHERE email = $1', [email]);
    userId = users[0].id;
    await dataSource.getRepository(CarbonOffsetRecord).save({
      userId,
      transactionId: null,
      amountXlm: '12.50000000',
      equivalentKgCo2: '0.001250',
    });
  });

  it('returns community totals and the authenticated user stats and history', async () => {
    const community = await request(app.getHttpServer()).get('/v2/carbon/community').expect(200);
    expect(JSON.stringify(community.body)).toContain('totalXlmOffset');

    const headers = { Authorization: `Bearer ${token}` };
    const stats = await request(app.getHttpServer())
      .get('/v2/users/me/carbon-offset/stats').set(headers).expect(200);
    expect(JSON.stringify(stats.body)).toContain('totalXlmOffset');
    const history = await request(app.getHttpServer())
      .get('/v2/users/me/carbon-offset/history?page=1&limit=10').set(headers).expect(200);
    expect(JSON.stringify(history.body)).toContain('12.5');
  });

  it('rejects unauthenticated access to user stats and history', async () => {
    await request(app.getHttpServer()).get('/v2/users/me/carbon-offset/stats').expect(401);
    await request(app.getHttpServer()).get('/v2/users/me/carbon-offset/history').expect(401);
  });
});
