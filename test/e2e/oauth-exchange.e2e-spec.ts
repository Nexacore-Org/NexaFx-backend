import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import {
  seedTestUser,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';
import { OAuthCodeService } from '../../src/auth/oauth-code.service';

/**
 * E2E coverage for the OAuth authorisation-code exchange.
 *
 * Regression guard: the Google and GitHub callbacks appended the access and
 * refresh tokens to the redirect URL. Long-lived credentials in a URL end up
 * in browser history, proxy and server logs and in the Referer header of
 * every request the landing page makes. The redirect now carries a one-time
 * code that is exchanged over POST.
 */
describe('OAuth code exchange (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let oauthCodes: OAuthCodeService;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    oauthCodes = app.get(OAuthCodeService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  const seedUser = (overrides: Record<string, unknown> = {}) =>
    seedTestUser(dataSource, {
      email: 'oauth-e2e@example.com',
      password: 'Password123!',
      ...overrides,
    });

  it('exchanges a one-time code for tokens', async () => {
    const user = await seedUser();
    const code = await oauthCodes.issue({
      userId: user.id,
      requiresTwoFactor: false,
      isNew: false,
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({ code })
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
  });

  it('cannot be replayed', async () => {
    const user = await seedUser();
    const code = await oauthCodes.issue({
      userId: user.id,
      requiresTwoFactor: false,
      isNew: false,
    });

    await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({ code })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({ code })
      .expect(401);
  });

  it('rejects an unknown code', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({ code: 'never-issued' })
      .expect(401);
  });

  it('requires a code', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({})
      .expect(400);
  });

  it('refuses to issue tokens for a suspended account', async () => {
    const user = await seedUser();
    await dataSource
      .getRepository('users')
      .update({ id: user.id }, { isSuspended: true } as never);

    const code = await oauthCodes.issue({
      userId: user.id,
      requiresTwoFactor: false,
      isNew: false,
    });

    await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({ code })
      .expect(403);
  });

  it('returns a partial token when the account requires two-factor', async () => {
    const user = await seedUser();
    await dataSource
      .getRepository('users')
      .update({ id: user.id }, { isTwoFactorEnabled: true } as never);

    const code = await oauthCodes.issue({
      userId: user.id,
      requiresTwoFactor: true,
      isNew: false,
    });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/oauth/exchange')
      .send({ code })
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.requiresTwoFactor).toBe(true);
    expect(body.refreshToken).toBeUndefined();
  });
});