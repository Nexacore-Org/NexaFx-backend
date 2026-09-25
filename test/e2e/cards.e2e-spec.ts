import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createTestApp } from '../helpers/app.helper';
import {
  truncateAll,
  seedTestUser,
  setupTestDatabase,
} from '../helpers/db.helper';
import { mockStripe, resetStripeMock } from '../mocks/stripe.mock';

/**
 * E2E coverage for the virtual cards domain (src/cards).
 *
 * Exercises the real HTTP request -> global JwtAuthGuard -> controller ->
 * service -> Postgres round trip. Stripe Issuing is the only external boundary
 * and is mocked globally via test/helpers/app.helper.ts.
 */
describe('Cards E2E Tests (#1097)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let userId: string;

  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-e2e';

  /** Sign a JWT directly for a seeded user (the guard/strategy still run for real). */
  function tokenFor(user: { id: string; email: string; role: string }): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
  }

  /** The global TransformResponseInterceptor wraps successful payloads in `data`. */
  function payload(res: request.Response): any {
    return res.body && res.body.data !== undefined ? res.body.data : res.body;
  }

  async function seedApprovedKyc(ownerId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO "kyc_records"
         (id, "userId", status, tier, "fullName", "dateOfBirth", nationality,
          "documentType", "documentNumber", "documentFrontKey", "selfieKey",
          "submittedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'approved', 2, 'Test User', '1990-01-01', 'US',
               'passport', 'P1234567', 'kyc/front.jpg', 'kyc/selfie.jpg',
               NOW(), NOW(), NOW())`,
      [uuidv4(), ownerId],
    );
  }

  async function seedCard(
    ownerId: string,
    overrides: Partial<{ status: string }> = {},
  ): Promise<string> {
    const id = uuidv4();
    await dataSource.query(
      `INSERT INTO "virtual_cards"
         (id, "userId", "stripeCardId", last4, "expMonth", "expYear", brand,
          status, "spendLimit", "blockedMccs", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, '4242', '12', '2030', 'Visa', $4, NULL, '[]', NOW(), NOW())`,
      [
        id,
        ownerId,
        `ic_seeded_${id.slice(0, 8)}`,
        overrides.status ?? 'ACTIVE',
      ],
    );
    return id;
  }

  async function seedCardTransaction(
    ownerId: string,
    cardId: string,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO "transactions"
         (id, "userId", type, amount, currency, status, metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, 'WITHDRAW', '12.5', 'USD', 'SUCCESS', $3, NOW(), NOW())`,
      [
        uuidv4(),
        ownerId,
        JSON.stringify({ cardId, stripeTransactionId: 'txn_1' }),
      ],
    );
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
    resetStripeMock();

    const user = await seedTestUser(dataSource, {
      email: 'cards-user@example.com',
    });
    userId = user.id;
    userToken = tokenFor(user);
  });

  // ---------------------------------------------------------------------------
  // POST /v1/cards
  // ---------------------------------------------------------------------------
  describe('POST /v1/cards', () => {
    it('issues a virtual card for a KYC-approved user', async () => {
      await seedApprovedKyc(userId);

      const res = await request(app.getHttpServer())
        .post('/v1/cards')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      const data = payload(res);
      expect(data).toHaveProperty('id');
      expect(data.last4).toBe('4242');
      expect(data.brand).toBe('Visa');
      expect(data.status).toBe('ACTIVE');
      expect(mockStripe.issuing.cardholders.create).toHaveBeenCalledTimes(1);
      expect(mockStripe.issuing.cards.create).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when the user has no approved KYC record', async () => {
      await request(app.getHttpServer())
        .post('/v1/cards')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(403);

      expect(mockStripe.issuing.cards.create).not.toHaveBeenCalled();
    });

    it('returns 400 for a validation failure (unknown field)', async () => {
      await seedApprovedKyc(userId);

      await request(app.getHttpServer())
        .post('/v1/cards')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ notARealField: true })
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).post('/v1/cards').send({}).expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/cards
  // ---------------------------------------------------------------------------
  describe('GET /v1/cards', () => {
    it("returns the caller's cards", async () => {
      await seedCard(userId);

      const res = await request(app.getHttpServer())
        .get('/v1/cards')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data = payload(res);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].last4).toBe('4242');
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/v1/cards').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/cards/:id/reveal
  // ---------------------------------------------------------------------------
  describe('GET /v1/cards/:id/reveal', () => {
    it('returns an ephemeral key for the card owner', async () => {
      const cardId = await seedCard(userId);

      const res = await request(app.getHttpServer())
        .get(`/v1/cards/${cardId}/reveal`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(payload(res).ephemeralKey).toBe('ek_test_ephemeral_secret');
    });

    it('returns 404 for an unknown card', async () => {
      await request(app.getHttpServer())
        .get(`/v1/cards/${uuidv4()}/reveal`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('returns 401 without a token', async () => {
      const cardId = await seedCard(userId);
      await request(app.getHttpServer())
        .get(`/v1/cards/${cardId}/reveal`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/cards/:id/freeze
  // ---------------------------------------------------------------------------
  describe('PATCH /v1/cards/:id/freeze', () => {
    it('freezes an active card', async () => {
      const cardId = await seedCard(userId, { status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/freeze`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(payload(res).status).toBe('FROZEN');
      expect(mockStripe.issuing.cards.update).toHaveBeenCalledTimes(1);
    });

    it('returns 401 without a token', async () => {
      const cardId = await seedCard(userId);
      await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/freeze`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/cards/:id/unfreeze
  // ---------------------------------------------------------------------------
  describe('PATCH /v1/cards/:id/unfreeze', () => {
    it('unfreezes a frozen card', async () => {
      const cardId = await seedCard(userId, { status: 'FROZEN' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/unfreeze`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(payload(res).status).toBe('ACTIVE');
    });

    it('returns 401 without a token', async () => {
      const cardId = await seedCard(userId);
      await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/unfreeze`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /v1/cards/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /v1/cards/:id', () => {
    it('cancels a card and persists the CANCELLED status', async () => {
      const cardId = await seedCard(userId);

      await request(app.getHttpServer())
        .delete(`/v1/cards/${cardId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const rows = await dataSource.query(
        `SELECT status FROM "virtual_cards" WHERE id = $1`,
        [cardId],
      );
      expect(rows[0].status).toBe('CANCELLED');
    });

    it('returns 401 without a token', async () => {
      const cardId = await seedCard(userId);
      await request(app.getHttpServer())
        .delete(`/v1/cards/${cardId}`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/cards/:id/controls
  // ---------------------------------------------------------------------------
  describe('PATCH /v1/cards/:id/controls', () => {
    it('updates spending controls', async () => {
      const cardId = await seedCard(userId);

      const res = await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/controls`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ spendLimit: '500.00', blockedMccs: ['5411', '7995'] })
        .expect(200);

      const data = payload(res);
      expect(parseFloat(data.spendLimit)).toBe(500);
      expect(data.blockedMccs).toEqual(['5411', '7995']);
      expect(mockStripe.issuing.cards.update).toHaveBeenCalled();
    });

    it('returns 400 for a validation failure (unknown field)', async () => {
      const cardId = await seedCard(userId);

      await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/controls`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ somethingInvalid: true })
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      const cardId = await seedCard(userId);
      await request(app.getHttpServer())
        .patch(`/v1/cards/${cardId}/controls`)
        .send({ spendLimit: '10' })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/cards/:id/transactions
  // ---------------------------------------------------------------------------
  describe('GET /v1/cards/:id/transactions', () => {
    it('returns the transactions recorded against the card', async () => {
      const cardId = await seedCard(userId);
      await seedCardTransaction(userId, cardId);

      const res = await request(app.getHttpServer())
        .get(`/v1/cards/${cardId}/transactions`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const data = payload(res);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].metadata.cardId).toBe(cardId);
    });

    it('returns 401 without a token', async () => {
      const cardId = await seedCard(userId);
      await request(app.getHttpServer())
        .get(`/v1/cards/${cardId}/transactions`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/cards/webhook  (public endpoint)
  // ---------------------------------------------------------------------------
  describe('POST /v1/cards/webhook', () => {
    it('accepts a Stripe event without authentication', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValueOnce({
        type: 'unhandled.event',
        data: { object: {} },
      });

      await request(app.getHttpServer())
        .post('/v1/cards/webhook')
        .set('stripe-signature', 'test-signature')
        .send({})
        .expect(201);
    });

    it('returns 400 when the signature is invalid', async () => {
      mockStripe.webhooks.constructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      await request(app.getHttpServer())
        .post('/v1/cards/webhook')
        .set('stripe-signature', 'bad-signature')
        .send({})
        .expect(400);
    });
  });
});
