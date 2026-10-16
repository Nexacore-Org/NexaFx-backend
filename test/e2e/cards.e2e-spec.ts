import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import {
  seedTestUser,
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
} from '../helpers/db.helper';
import { resetStripeMock } from '../mocks/stripe.mock';
import { VirtualCard, CardStatus } from '../../src/cards/entities/virtual-card.entity';
import {
  KycRecord,
  KycStatus,
  DocumentType,
} from '../../src/kyc/entities/kyc.entity';

process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || 'sk_test_cards_e2e';

/**
 * E2E coverage for the virtual cards routes that were restored from
 * v2-archive-2026-10-07 and re-registered in AppModule.
 *
 * Exercises the real controller -> service -> repository path. The only
 * external boundary (Stripe Issuing) is the mock registered globally in
 * app.helper, so no real card is ever provisioned.
 */
describe('Virtual cards (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;

  let token: string;
  let otherToken: string;
  let userId: string;
  let otherUserId: string;

  const seedCard = async (ownerId: string, status = CardStatus.ACTIVE) => {
    const repo = dataSource.getRepository(VirtualCard);
    return repo.save(
      repo.create({
        userId: ownerId,
        stripeCardId: `ic_${ownerId.slice(0, 6)}`,
        last4: '4242',
        expMonth: '12',
        expYear: '2030',
        brand: 'Visa',
        status,
        spendLimit: null,
        blockedMccs: [],
      } as Partial<VirtualCard>),
    );
  };

  const approveKyc = async (ownerId: string) => {
    const repo = dataSource.getRepository(KycRecord);
    await repo.save(
      repo.create({
        userId: ownerId,
        status: KycStatus.APPROVED,
        fullName: 'Card Holder',
        dateOfBirth: new Date('1990-01-01'),
        nationality: 'US',
        documentType: DocumentType.PASSPORT,
        documentNumber: 'X1234567',
        documentFrontKey: 'kyc/front.jpg',
        selfieKey: 'kyc/selfie.jpg',
      } as Partial<KycRecord>),
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource);
    resetStripeMock();

    const user = await seedTestUser(dataSource, {
      email: 'cards-user@example.com',
      password: 'Password123!',
    });
    const other = await seedTestUser(dataSource, {
      email: 'cards-other@example.com',
      password: 'Password123!',
    });
    userId = user.id;
    otherUserId = other.id;

    token = jwt.sign({ sub: userId, email: user.email, role: user.role });
    otherToken = jwt.sign({
      sub: otherUserId,
      email: other.email,
      role: other.role,
    });
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/v1/cards').expect(401);
  });

  it('returns an empty list when the user has no cards', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/cards')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body).toEqual([]);
  });

  it('lists the caller cards', async () => {
    const card = await seedCard(userId);

    const res = await request(app.getHttpServer())
      .get('/v1/cards')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(card.id);
    expect(body[0].last4).toBe('4242');
    expect(body[0].status).toBe(CardStatus.ACTIVE);
  });

  it('freezes a card and persists the new status', async () => {
    const card = await seedCard(userId);

    const res = await request(app.getHttpServer())
      .patch(`/v1/cards/${card.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.status).toBe(CardStatus.FROZEN);

    const persisted = await dataSource.getRepository(VirtualCard).findOneByOrFail({
      id: card.id,
    });
    expect(persisted.status).toBe(CardStatus.FROZEN);
  });

  it('unfreezes a card', async () => {
    const card = await seedCard(userId, CardStatus.FROZEN);

    const res = await request(app.getHttpServer())
      .patch(`/v1/cards/${card.id}/unfreeze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.status).toBe(CardStatus.ACTIVE);
  });

  it("refuses to touch another user's card", async () => {
    const card = await seedCard(otherUserId);

    await request(app.getHttpServer())
      .patch(`/v1/cards/${card.id}/freeze`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 for a card that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/v1/cards/00000000-0000-4000-8000-000000000000/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('refuses to create a card without an approved KYC record', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);

    expect((res.body?.data ?? res.body).message).toMatch(/KYC/i);
  });

  it('creates a virtual card once KYC is approved', async () => {
    await approveKyc(userId);

    const res = await request(app.getHttpServer())
      .post('/v1/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const body = res.body?.data ?? res.body;
    expect(body.last4).toBe('4242');
    expect(body.brand).toBe('Visa');
    expect(body.status).toBe(CardStatus.ACTIVE);

    const stored = await dataSource.getRepository(VirtualCard).findOneByOrFail({
      userId,
    });
    expect(stored.stripeCardId).toBe('ic_test_card');
  });

  it('rejects a second active card for the same user', async () => {
    await approveKyc(userId);
    await seedCard(userId);

    await request(app.getHttpServer())
      .post('/v1/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('lists the transactions recorded against a card', async () => {
    const card = await seedCard(userId);

    const res = await request(app.getHttpServer())
      .get(`/v1/cards/${card.id}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("cannot list another user's card transactions", async () => {
    const card = await seedCard(otherUserId);

    await request(app.getHttpServer())
      .get(`/v1/cards/${card.id}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});