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
import { v4 as uuidv4 } from 'uuid';

describe('Referrals E2E Tests (#1474)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let userToken: string;
  let userId: string;
  const testEmail = 'referrals-user@example.com';
  const testPassword = 'ReferralsPass123!';

  async function registerAndLogin(
    email: string,
    password: string,
  ): Promise<{ token: string; id: string }> {
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password,
        firstName: 'Referrals',
        lastName: 'Tester',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);

    const rows = await dataSource.query(
      `SELECT id FROM "users" WHERE email = $1`,
      [email],
    );
    return { token: res.body.accessToken, id: rows[0].id };
  }

  async function seedReferral(
    referrerId: string,
    refereeId: string,
    status: 'pending' | 'rewarded' = 'pending',
    rewardAmount: string | null = null,
    rewardCurrency: string | null = null,
  ): Promise<string> {
    const id = uuidv4();
    await dataSource.query(
      `INSERT INTO "referrals"
         (id, "referrerId", "refereeId", status, "rewardAmount", "rewardCurrency",
          "rewardedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6,
               $7::timestamptz,
               NOW(), NOW())`,
      [
        id,
        referrerId,
        refereeId,
        status,
        rewardAmount,
        rewardCurrency,
        status === 'rewarded' ? new Date().toISOString() : null,
      ],
    );
    return id;
  }

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

    const auth = await registerAndLogin(testEmail, testPassword);
    userToken = auth.token;
    userId = auth.id;
  });

  describe('GET /v1/referrals/stats', () => {
    it('returns referral stats with empty per-currency earnings when no referrals exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data = res.body?.data !== undefined ? res.body.data : res.body;

      expect(data).toHaveProperty('referralCode');
      expect(typeof data.referralCode).toBe('string');
      expect(data.referralCount).toBe(0);
      expect(data.pendingRewards).toBe(0);
      expect(data.totalEarned).toEqual({});
    });

    it('reflects correct counts and per-currency earnings after seeding pending and rewarded referrals', async () => {
      const referee1 = await seedTestUser(dataSource, {
        email: 'referee-1@example.com',
        password: 'Referee1Pass123!',
      });
      const referee2 = await seedTestUser(dataSource, {
        email: 'referee-2@example.com',
        password: 'Referee2Pass123!',
      });

      await seedReferral(userId, referee1.id, 'pending');
      await seedReferral(userId, referee2.id, 'rewarded', '10.00', 'USD');

      const res = await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data = res.body?.data !== undefined ? res.body.data : res.body;

      expect(data.referralCount).toBe(2);
      expect(data.pendingRewards).toBe(1);
      expect(data.totalEarned).toEqual({ USD: 10 });
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer()).get('/v1/referrals/stats').expect(401);
    });
  });

  describe('GET /v1/referrals', () => {
    it('returns a paginated empty list when the user has made no referrals', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const payload = res.body?.data !== undefined ? res.body.data : res.body;
      const items = Array.isArray(payload) ? payload : payload.data;

      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(0);
    });

    it('returns maskedEmail and firstName only, never exposing raw email or lastName', async () => {
      const referee = await seedTestUser(dataSource, {
        email: 'referee-detail@example.com',
        password: 'RefereeDetailPass123!',
        firstName: 'Jane',
        lastName: 'RefereeSecretLast',
      });

      await seedReferral(userId, referee.id, 'pending');

      const res = await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const payload = res.body?.data !== undefined ? res.body.data : res.body;
      const items: any[] = Array.isArray(payload) ? payload : payload.data;

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('status', 'pending');
      expect(item).toHaveProperty('maskedEmail', 'r***@e***.com');
      expect(item).toHaveProperty('firstName', 'Jane');
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('lastName');
      expect(item).not.toHaveProperty('referee');
      expect(JSON.stringify(res.body)).not.toContain(
        'referee-detail@example.com',
      );
      expect(JSON.stringify(res.body)).not.toContain('RefereeSecretLast');
    });

    it('rejects limit > 100 with 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals?limit=101')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });
  });
});
