import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import {
  seedTestUser,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';
import { RefreshTokensService } from '../../src/tokens/refresh-tokens.service';

process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || 'logout-e2e-refresh-secret';

/**
 * E2E coverage for POST /v1/auth/logout.
 *
 * Regression guard: logout used to revoke `req.user.jti`, which is never a
 * refresh token (access tokens are signed without a jti), so the session
 * survived logout for the full refresh lifetime. These tests take a real
 * refresh token, log out, and prove the refresh endpoint then refuses it.
 */
describe('Auth logout (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let refreshTokens: RefreshTokensService;

  let accessToken: string;
  let refreshToken: string;
  let otherAccessToken: string;
  let otherRefreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    refreshTokens = app.get(RefreshTokensService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const user = await seedTestUser(dataSource, {
      email: 'logout-user@example.com',
      password: 'Password123!',
    });
    const other = await seedTestUser(dataSource, {
      email: 'logout-other@example.com',
      password: 'Password123!',
    });

    accessToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    otherAccessToken = jwt.sign({
      sub: other.id,
      email: other.email,
      role: other.role,
    });

    refreshToken = await refreshTokens.createRefreshToken(user.id);
    otherRefreshToken = await refreshTokens.createRefreshToken(other.id);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects a logout without a refresh token', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);
  });

  it('accepts the refresh token in the body', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.message).toMatch(/logged out/i);
  });

  it('rejects the refresh token afterwards', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('does not revoke a refresh token that belongs to somebody else', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: otherRefreshToken })
      .expect(401);

    // The other session must survive the attempt.
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: otherRefreshToken })
      .expect(200);
  });

  it('rejects an unknown refresh token', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
  });

  it('keeps other sessions of the same user alive', async () => {
    const owner = await dataSource
      .getRepository('users')
      .findOneByOrFail({ email: 'logout-user@example.com' });
    const secondToken = await refreshTokens.createRefreshToken(
      (owner as unknown as { id: string }).id,
    );

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: secondToken })
      .expect(200);

    expect(otherAccessToken).toBeDefined();
  });
});