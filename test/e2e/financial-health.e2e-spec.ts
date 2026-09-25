import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  getLatestOtp,
  setupTestDatabase,
} from '../helpers/db.helper';

/**
 * Financial Health E2E
 *
 * Exercises the real HTTP -> global JwtAuthGuard -> controller -> service ->
 * Postgres round trip for /v2/financial-health. Only true external
 * boundaries (Firebase, Mailgun, Stellar) are mocked, via app.helper.
 */
describe('Financial Health E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let userId: string;

  const BASE = '/v2/financial-health';

  /** Unwraps the TransformResponseInterceptor envelope when present. */
  const payload = (res: request.Response) => res.body?.data ?? res.body;

  /**
   * Helper — sign up a fresh user via the real auth flow and return their JWT.
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
        firstName: 'Health',
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
    return { token: payload(res).accessToken, id: rows[0].id };
  }

  /** Insert a score row directly so history ordering is fully controlled. */
  async function seedScore(
    ownerId: string,
    score: number,
    calculatedAt: string,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO "financial_health_scores"
         ("userId", score, grade, breakdown, tips, "previousScore", "scoreDelta", "calculatedAt")
       VALUES ($1, $2, $3, $4, $5, 0, 0, $6)`,
      [
        ownerId,
        score,
        score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'FAIR' : 'POOR',
        JSON.stringify({
          savingsRateScore: 3,
          spendingConsistencyScore: 15,
          loanRepaymentScore: 20,
          diversificationScore: 15,
          transactionFrequencyScore: 10,
          kycTierScore: 6,
          accountAgeScore: 10,
        }),
        ['Keep it up'],
        calculatedAt,
      ],
    );
  }

  const countScores = async (ownerId: string): Promise<number> => {
    const rows = await dataSource.query(
      `SELECT COUNT(*)::int AS n FROM "financial_health_scores" WHERE "userId" = $1`,
      [ownerId],
    );
    return rows[0].n;
  };

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

    const auth = await registerAndLogin(
      'health-user@example.com',
      'HealthPass123!',
    );
    userToken = auth.token;
    userId = auth.id;
  });

  // ---------------------------------------------------------------------------
  // GET /v2/financial-health
  // ---------------------------------------------------------------------------
  describe(`GET ${BASE}`, () => {
    it('lazily calculates and persists a score on first request', async () => {
      expect(await countScores(userId)).toBe(0);

      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const body = payload(res);
      expect(body.userId).toBe(userId);
      expect(body.score).toEqual(expect.any(Number));
      expect(body.score).toBeGreaterThanOrEqual(0);
      expect(body.score).toBeLessThanOrEqual(100);
      expect(['POOR', 'FAIR', 'GOOD', 'EXCELLENT']).toContain(body.grade);
      expect(body.breakdown).toEqual(
        expect.objectContaining({
          savingsRateScore: expect.any(Number),
          loanRepaymentScore: expect.any(Number),
        }),
      );
      expect(Array.isArray(body.tips)).toBe(true);
      expect(body.tips.length).toBeLessThanOrEqual(3);

      expect(await countScores(userId)).toBe(1);
    });

    it('returns the latest stored score without recalculating', async () => {
      await seedScore(userId, 55, '2026-01-01T00:00:00Z');
      await seedScore(userId, 91, '2026-02-01T00:00:00Z');

      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(payload(res).score).toBe(91);
      expect(await countScores(userId)).toBe(2);
    });

    it('never returns another user’s score', async () => {
      const other = await registerAndLogin(
        'other-health@example.com',
        'OtherPass123!',
      );
      await seedScore(other.id, 12, '2026-02-01T00:00:00Z');

      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(payload(res).userId).toBe(userId);
      expect(payload(res).score).not.toBe(12);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get(BASE).expect(401);
    });

    it('rejects an invalid bearer token with 401', async () => {
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('is not exposed under the default v1 version', async () => {
      await request(app.getHttpServer())
        .get('/v1/financial-health')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v2/financial-health/history
  // ---------------------------------------------------------------------------
  describe(`GET ${BASE}/history`, () => {
    beforeEach(async () => {
      for (let i = 1; i <= 14; i += 1) {
        const day = String(i).padStart(2, '0');
        await seedScore(userId, 40 + i, `2026-03-${day}T00:00:00Z`);
      }
    });

    it('returns the last 12 scores, newest first, by default', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/history`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const history = payload(res);
      expect(history).toHaveLength(12);
      expect(history[0].score).toBe(54);
      expect(history[11].score).toBe(43);
      history.forEach((h: any) => expect(h.userId).toBe(userId));
    });

    it('honours the weeks query parameter', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/history?weeks=3`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(payload(res).map((h: any) => h.score)).toEqual([54, 53, 52]);
    });

    it('returns an empty list for a user with no history', async () => {
      const other = await registerAndLogin(
        'empty-health@example.com',
        'EmptyPass123!',
      );

      const res = await request(app.getHttpServer())
        .get(`${BASE}/history`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);

      expect(payload(res)).toEqual([]);
    });

    it('rejects a non-numeric weeks value with 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/history?weeks=abc`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects a non-positive weeks value with 400', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/history?weeks=0`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get(`${BASE}/history`).expect(401);
    });
  });
});
