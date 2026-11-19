import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import {
  seedTestUser,
  setupTestDatabase,
  truncateAll,
} from './helpers/db.helper';
import { RefreshTokensService } from '../src/tokens/refresh-tokens.service';

process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || 'refresh-e2e-refresh-secret';

describe('Auth refresh rotation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let refreshTokens: RefreshTokensService;
  let user: any;
  let refreshToken: string;
  let clientIp = 1;

  beforeAll(async () => {
    app = await createTestApp();
    (app.getHttpAdapter().getInstance() as any).set('trust proxy', true);
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
    user = await seedTestUser(dataSource, {
      email: 'refresh-user@example.com',
      password: 'Password123!',
    });
    refreshToken = await refreshTokens.createRefreshToken(user.id);
  });

  const client = (method: 'get' | 'post', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('X-Forwarded-For', `10.0.0.${clientIp++}`);
  const refresh = (token: string) =>
    client('post', '/v1/auth/refresh').send({ refreshToken: token });

  it('POST /v1/auth/refresh with empty body returns 400', () => {
    return client('post', '/v1/auth/refresh').send({}).expect(400);
  });

  it('POST /v1/auth/refresh with empty refreshToken returns 400', () => {
    return client('post', '/v1/auth/refresh')
      .send({ refreshToken: '' })
      .expect(400);
  });

  it('revokes the presented token and returns a new pair in the same family', async () => {
    const response = await refresh(refreshToken).expect(200);
    const body = response.body?.data ?? response.body;

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.refreshToken).not.toBe(refreshToken);
    expect(body.expiresIn).toEqual(expect.any(Number));

    const rows = await dataSource.query(
      'SELECT "familyId" FROM "refresh_tokens" WHERE "userId" = $1',
      [user.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].familyId).toEqual(rows[1].familyId);

    await refresh(body.refreshToken).expect(200);
    await refresh(refreshToken).expect(401);
  });

  it('reuse of a rotated token revokes the whole family', async () => {
    const response = await refresh(refreshToken).expect(200);
    const rotated = (response.body?.data ?? response.body).refreshToken;

    await refresh(refreshToken).expect(401);
    await refresh(rotated).expect(401);
  });

  it('rejects an access token after logout-all bumps the token version', async () => {
    const accessToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    });

    await client('get', '/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await client('post', '/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await client('get', '/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });
});
