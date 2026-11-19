import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import * as speakeasy from 'speakeasy';
import { createTestApp } from '../helpers/app.helper';
import { EncryptionService } from '../../src/common/services/encryption.service';
import {
  seedTestUser,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';

process.env.WALLET_ENCRYPTION_KEY =
  process.env.WALLET_ENCRYPTION_KEY ?? '0'.repeat(64);

/**
 * E2E coverage for the JwtAuthGuard partial_auth allow-list.
 *
 * Regression guard: the guard compared the raw request path against
 * '/two-factor/verify', but URI versioning prefixes every route, so
 * POST /v1/two-factor/verify was rejected with 403 and users with 2FA could
 * never finish signing in. The allow-list is now driven by @AllowPartialAuth()
 * metadata.
 */
describe('Partial auth allow-list (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;

  let partialToken: string;
  let fullToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const user = await seedTestUser(dataSource, {
      email: 'partial-auth@example.com',
      password: 'Password123!',
    });
    userId = user.id;

    partialToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      authStage: 'partial_auth',
    });
    fullToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  });

  it('reaches the two-factor verify route instead of being turned away', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/two-factor/verify')
      .set('Authorization', `Bearer ${partialToken}`)
      .send({ totpCode: '000000' });

    // The guard must let the request through; the handler then rejects the
    // bogus code. 403 here would mean the allow-list missed the route again.
    expect(res.status).not.toBe(403);
    expect([400, 401]).toContain(res.status);
  });

  it('exchanges a partial token plus a valid TOTP for full tokens', async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32!;
    const encrypted = app.get(EncryptionService).encrypt(secret);
    await dataSource.query(
      'UPDATE "users" SET "twoFactorSecret" = $1, "isTwoFactorEnabled" = true, "lastTotpStep" = NULL WHERE id = $2',
      [encrypted, userId],
    );

    const totpCode = speakeasy.totp({ secret, encoding: 'base32' });
    const res = await request(app.getHttpServer())
      .post('/v1/two-factor/verify')
      .set('Authorization', `Bearer ${partialToken}`)
      .send({ totpCode });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toEqual(expect.any(Number));
  });

  it('is still rejected on every other REST route', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${partialToken}`);

    expect(res.status).toBe(403);
  });

  it('is rejected on a second two-factor route', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/two-factor/status')
      .set('Authorization', `Bearer ${partialToken}`);

    expect(res.status).toBe(403);
  });

  it('does not affect fully authenticated tokens', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${fullToken}`);

    expect(res.status).not.toBe(403);
  });
});