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

describe('Referrals E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  /** Primary test user */
  let userToken: string;
  let userId: string;
  const testEmail = 'referrals-user@example.com';
  const testPassword = 'ReferralsPass123!';

  /**
   * Helper — register a new user via the real auth flow and return their JWT.
   */
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

  /**
   * Directly seed a referral row so tests are not coupled to the reward flow.
   */
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

  // ---------------------------------------------------------------------------
  // GET /v1/referrals/stats
  // ---------------------------------------------------------------------------
  describe('GET /v1/referrals/stats', () => {
    it('returns referral stats with zero counts when no referrals exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // May be wrapped by TransformResponseInterceptor
      const data =
        res.body?.data !== undefined ? res.body.data : res.body;

      expect(data).toHaveProperty('referralCode');
      expect(typeof data.referralCode).toBe('string');
      expect(data.referralCount).toBe(0);
      expect(data.pendingRewards).toBe(0);
      expect(data.totalEarned).toBe(0);
    });

    it('reflects correct counts after seeding pending and rewarded referrals', async () => {
      // Seed two referee users (they just need an id row in the users table)
      const referee1 = await seedTestUser(dataSource, {
        email: 'referee-1@example.com',
        password: 'Referee1Pass123!',
      });
      const referee2 = await seedTestUser(dataSource, {
        email: 'referee-2@example.com',
        password: 'Referee2Pass123!',
      });

      // One pending, one rewarded (10 USD)
      await seedReferral(userId, referee1.id, 'pending');
      await seedReferral(userId, referee2.id, 'rewarded', '10.00', 'USD');

      const res = await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data =
        res.body?.data !== undefined ? res.body.data : res.body;

      expect(data.referralCount).toBe(2);
      expect(data.pendingRewards).toBe(1);
      expect(Number(data.totalEarned)).toBeCloseTo(10, 2);
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .expect(401);
    });

    it('returns 401 for an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .set('Authorization', 'Bearer completely-invalid-token')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/referrals
  // ---------------------------------------------------------------------------
  describe('GET /v1/referrals', () => {
    it('returns an empty array when the user has made no referrals', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data =
        res.body?.data !== undefined ? res.body.data : res.body;

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('returns a list of referral items with nested referee details', async () => {
      // Seed a referee with a known user row
      const referee = await seedTestUser(dataSource, {
        email: 'referee-detail@example.com',
        password: 'RefereeDetailPass123!',
        firstName: 'Jane',
        lastName: 'Referee',
      });

      await seedReferral(userId, referee.id, 'pending');

      const res = await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data: any[] =
        res.body?.data !== undefined ? res.body.data : res.body;

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);

      const item = data[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('status');
      expect(item.status).toBe('pending');
      expect(item).toHaveProperty('referee');
      expect(item.referee).toHaveProperty('email', 'referee-detail@example.com');
    });

    it('returns only the referrals made by the authenticated user (data isolation)', async () => {
      // Create a second user who also has a referee
      const secondAuth = await registerAndLogin(
        'referrals-user2@example.com',
        'ReferralsPass2!',
      );
      const referee = await seedTestUser(dataSource, {
        email: 'isolation-referee@example.com',
        password: 'IsolationPass123!',
      });

      // Second user's referral — should NOT appear in first user's list
      await seedReferral(secondAuth.id, referee.id, 'pending');

      const res = await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data: any[] =
        res.body?.data !== undefined ? res.body.data : res.body;

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('returns both pending and rewarded referrals', async () => {
      const referee1 = await seedTestUser(dataSource, {
        email: 'ref-a@example.com',
        password: 'RefAPass123!',
      });
      const referee2 = await seedTestUser(dataSource, {
        email: 'ref-b@example.com',
        password: 'RefBPass123!',
      });

      await seedReferral(userId, referee1.id, 'pending');
      await seedReferral(userId, referee2.id, 'rewarded', '5.00', 'USD');

      const res = await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data: any[] =
        res.body?.data !== undefined ? res.body.data : res.body;

      expect(data).toHaveLength(2);

      const statuses = data.map((item) => item.status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('rewarded');
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals')
        .expect(401);
    });

    it('returns 401 for an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals')
        .set('Authorization', 'Bearer bad-token')
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Unauthenticated access — blanket check across all endpoints
  // ---------------------------------------------------------------------------
  describe('Unauthenticated access', () => {
    it('rejects GET /v1/referrals/stats without a token (401)', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals/stats')
        .expect(401);
    });

    it('rejects GET /v1/referrals without a token (401)', async () => {
      await request(app.getHttpServer())
        .get('/v1/referrals')
        .expect(401);
    });
  });
});
