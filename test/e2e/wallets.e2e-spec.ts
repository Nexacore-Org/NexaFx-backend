import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, setupTestDatabase } from '../helpers/db.helper';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * A valid Stellar public key (56-char, starts with G, base32).
 * Used for watch-only import tests.
 */
const VALID_STELLAR_KEY =
  'GBMOIMFPXCNXQSQ2XEUVB36L4DYFVYOYHIEBSZ4BIFN2OYUMCBYNAFP';

/**
 * Seed a verified user and mint a short-lived JWT for them.
 * Inserts directly into the DB to bypass the OTP signup flow.
 */
async function seedUserAndGetToken(
  dataSource: DataSource,
  opts: { email: string; role?: string } = { email: 'wallet-user@example.com' },
): Promise<{ userId: string; token: string }> {
  const email = opts.email;
  const role = opts.role ?? 'USER';
  const secret =
    process.env.JWT_SECRET || 'default-secret-change-in-production';

  const rows = await dataSource.query(
    `INSERT INTO users (
       email, "passwordHash", "walletPublicKey", "walletSecretKeyEncrypted",
       "referralCode", role, "isActive", "isVerified", "createdAt", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())
     RETURNING id`,
    [
      email,
      'hashed-pw',
      'G' + 'A'.repeat(55),
      'enc-secret',
      Math.random().toString(36).slice(2, 10).toUpperCase(),
      role,
    ],
  );

  const userId: string = rows[0].id;
  const token = jwt.sign({ sub: userId, email, role }, secret, {
    expiresIn: '1h',
  });

  return { userId, token };
}

/**
 * Directly insert a wallet row for a user — useful when a test needs a
 * pre-existing wallet without going through the generate endpoint.
 */
async function seedWallet(
  dataSource: DataSource,
  userId: string,
  opts: {
    publicKey?: string;
    encryptedSecretKey?: string | null;
    label?: string;
    isDefault?: boolean;
    currency?: string;
  } = {},
): Promise<string> {
  const publicKey = opts.publicKey ?? 'G' + 'B'.repeat(55);
  const label = opts.label ?? 'Test Wallet';
  const isDefault = opts.isDefault ?? false;
  const currency = opts.currency ?? 'XLM';
  const encryptedSecretKey =
    opts.encryptedSecretKey !== undefined ? opts.encryptedSecretKey : 'enc';

  const rows = await dataSource.query(
    `INSERT INTO wallets (
       "userId", "publicKey", "encryptedSecretKey", label, "isDefault",
       currency, network, "createdAt", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'TESTNET', NOW(), NOW())
     RETURNING id`,
    [userId, publicKey, encryptedSecretKey, label, isDefault, currency],
  );

  return rows[0].id as string;
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('Wallets E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let userId: string;
  let otherToken: string;
  let otherUserId: string;

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
    ({ token: userToken, userId } = await seedUserAndGetToken(dataSource, {
      email: 'wallet-user@example.com',
    }));
    ({ token: otherToken, userId: otherUserId } = await seedUserAndGetToken(
      dataSource,
      { email: 'other-wallet-user@example.com' },
    ));
  });

  // ── POST /v1/wallets/generate ─────────────────────────────────────────────

  describe('POST /v1/wallets/generate', () => {
    it('generates a new wallet for an authenticated user (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('publicKey');
      expect(res.body).toHaveProperty('isDefault');
      // Encrypted secret key must not be exposed
      expect(res.body.encryptedSecretKey).toBeUndefined();
    });

    it('accepts an optional label (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'Savings' })
        .expect(201);

      expect(res.body).toHaveProperty('label', 'Savings');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .send({})
        .expect(401);
    });

    it('rejects a label that exceeds 100 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'x'.repeat(101) })
        .expect(400);
    });

    it('rejects extra/unknown fields in the body with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'Ok', unknownField: 'bad' })
        .expect(400);
    });
  });

  // ── POST /v1/wallets/import ───────────────────────────────────────────────

  describe('POST /v1/wallets/import', () => {
    it('imports a watch-only wallet by public key (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publicKey: VALID_STELLAR_KEY })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('publicKey', VALID_STELLAR_KEY);
      expect(res.body).toHaveProperty('isWatchOnly', true);
    });

    it('accepts an optional label on import (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publicKey: VALID_STELLAR_KEY, label: 'Cold storage' })
        .expect(201);

      expect(res.body).toHaveProperty('label', 'Cold storage');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .send({ publicKey: VALID_STELLAR_KEY })
        .expect(401);
    });

    it('rejects a missing publicKey with 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);
    });

    it('rejects a key that is not 56 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publicKey: 'GSHORT' })
        .expect(400);
    });

    it('rejects a key that does not start with G with 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publicKey: 'X' + 'A'.repeat(55) })
        .expect(400);
    });

    it('rejects duplicate public key for the same user with 400', async () => {
      // First import succeeds
      await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publicKey: VALID_STELLAR_KEY })
        .expect(201);

      // Second import of same key fails
      await request(app.getHttpServer())
        .post('/v1/wallets/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publicKey: VALID_STELLAR_KEY })
        .expect(400);
    });
  });

  // ── GET /v1/wallets ───────────────────────────────────────────────────────

  describe('GET /v1/wallets', () => {
    it('returns paginated wallets for the authenticated user (200)', async () => {
      // Generate a wallet first so the list is non-empty
      await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // WalletsService.listWallets returns PaginatedWallets { items, total, page, pageSize }
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('total');
    });

    it('returns an empty list when user has no wallets (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(0);
    });

    it('does not expose other users\' wallets', async () => {
      await request(app.getHttpServer())
        .post('/v1/wallets/generate')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/v1/wallets').expect(401);
    });
  });

  // ── GET /v1/wallets/:currency ─────────────────────────────────────────────

  describe('GET /v1/wallets/:currency', () => {
    it('returns the wallet for a given currency (200)', async () => {
      // Seed an XLM wallet directly so we know the currency
      await seedWallet(dataSource, userId, {
        currency: 'XLM',
        isDefault: true,
        label: 'Primary',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/wallets/XLM')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('currency', 'XLM');
    });

    it('returns 404 for a currency the user has no wallet for', async () => {
      await request(app.getHttpServer())
        .get('/v1/wallets/NGN')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/v1/wallets/XLM').expect(401);
    });
  });

  // ── PATCH /v1/wallets/:id ─────────────────────────────────────────────────

  describe('PATCH /v1/wallets/:id', () => {
    it('updates the wallet label (200)', async () => {
      const walletId = await seedWallet(dataSource, userId, {
        label: 'Old Label',
      });

      const res = await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'New Label' })
        .expect(200);

      expect(res.body).toHaveProperty('label', 'New Label');
    });

    it('rejects an empty label with 400', async () => {
      const walletId = await seedWallet(dataSource, userId);

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: '' })
        .expect(400);
    });

    it('rejects a missing label field with 400', async () => {
      const walletId = await seedWallet(dataSource, userId);

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);
    });

    it('returns 404 when patching another user\'s wallet', async () => {
      const walletId = await seedWallet(dataSource, otherUserId, {
        label: 'Other',
      });

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'Hijacked' })
        .expect(404);
    });

    it('returns 400 for a non-UUID wallet id', async () => {
      await request(app.getHttpServer())
        .patch('/v1/wallets/not-a-uuid')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'Test' })
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const walletId = await seedWallet(dataSource, userId);

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}`)
        .send({ label: 'Test' })
        .expect(401);
    });
  });

  // ── PATCH /v1/wallets/:id/set-default ────────────────────────────────────

  describe('PATCH /v1/wallets/:id/set-default', () => {
    it('sets a wallet as default and returns success message (200)', async () => {
      // Seed two wallets — one default, one not
      await seedWallet(dataSource, userId, { isDefault: true, label: 'Primary' });
      const secondId = await seedWallet(dataSource, userId, {
        isDefault: false,
        label: 'Secondary',
        publicKey: 'G' + 'C'.repeat(55),
      });

      const res = await request(app.getHttpServer())
        .patch(`/v1/wallets/${secondId}/set-default`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message', 'Default wallet updated');
    });

    it('returns 404 when wallet does not belong to user', async () => {
      const walletId = await seedWallet(dataSource, otherUserId, {
        isDefault: true,
      });

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}/set-default`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('returns 400 for a non-UUID wallet id', async () => {
      await request(app.getHttpServer())
        .patch('/v1/wallets/not-a-uuid/set-default')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const walletId = await seedWallet(dataSource, userId, {
        isDefault: false,
      });

      await request(app.getHttpServer())
        .patch(`/v1/wallets/${walletId}/set-default`)
        .expect(401);
    });
  });

  // ── DELETE /v1/wallets/:id ────────────────────────────────────────────────

  describe('DELETE /v1/wallets/:id', () => {
    it('deletes a non-default wallet and returns success message (200)', async () => {
      // Need two wallets: one default (cannot be deleted), one secondary
      await seedWallet(dataSource, userId, { isDefault: true, label: 'Primary' });
      const secondId = await seedWallet(dataSource, userId, {
        isDefault: false,
        label: 'Secondary',
        publicKey: 'G' + 'C'.repeat(55),
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/wallets/${secondId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message', 'Wallet removed');
    });

    it('rejects deleting the only wallet with 400', async () => {
      const walletId = await seedWallet(dataSource, userId, {
        isDefault: true,
      });

      await request(app.getHttpServer())
        .delete(`/v1/wallets/${walletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects deleting the default wallet (even if multiple exist) with 400', async () => {
      const defaultId = await seedWallet(dataSource, userId, {
        isDefault: true,
        label: 'Default',
      });
      await seedWallet(dataSource, userId, {
        isDefault: false,
        label: 'Secondary',
        publicKey: 'G' + 'C'.repeat(55),
      });

      await request(app.getHttpServer())
        .delete(`/v1/wallets/${defaultId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('returns 404 when wallet does not belong to user', async () => {
      await seedWallet(dataSource, otherUserId, { isDefault: true, label: 'A' });
      const otherId = await seedWallet(dataSource, otherUserId, {
        isDefault: false,
        label: 'B',
        publicKey: 'G' + 'C'.repeat(55),
      });

      await request(app.getHttpServer())
        .delete(`/v1/wallets/${otherId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('returns 400 for a non-UUID wallet id', async () => {
      await request(app.getHttpServer())
        .delete('/v1/wallets/not-a-uuid')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await seedWallet(dataSource, userId, { isDefault: true, label: 'A' });
      const secondId = await seedWallet(dataSource, userId, {
        isDefault: false,
        label: 'B',
        publicKey: 'G' + 'C'.repeat(55),
      });

      await request(app.getHttpServer())
        .delete(`/v1/wallets/${secondId}`)
        .expect(401);
    });
  });
});
