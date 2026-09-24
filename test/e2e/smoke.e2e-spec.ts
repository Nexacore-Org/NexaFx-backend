import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { createTestApp } from '../helpers/app.helper';
import { setupTestDatabase } from '../helpers/db.helper';

describe('Boot smoke (temporary)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  }, 180000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('boots and serves health', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    console.log('SMOKE health:', res.status, JSON.stringify(res.body));
    expect([200, 503]).toContain(res.status);
  });

  it('seed + mint token + hit risk high-risk', async () => {
    const rows = await dataSource.query(
      `INSERT INTO users (email, "passwordHash", "walletPublicKey", "walletSecretKeyEncrypted", "referralCode", role, "isActive", "isVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ADMIN', true, true, NOW(), NOW()) RETURNING id`,
      ['smoke-admin@example.com', 'x', 'G' + 'A'.repeat(55), 'enc', 'SMOKE001'],
    );
    const secret =
      process.env.JWT_SECRET || 'default-secret-change-in-production';
    const token = jwt.sign(
      { sub: rows[0].id, email: 'smoke-admin@example.com', role: 'ADMIN' },
      secret,
      { expiresIn: '15m' },
    );

    const res = await request(app.getHttpServer())
      .get('/v1/admin/risk/users/high-risk')
      .set('Authorization', `Bearer ${token}`);
    console.log(
      'SMOKE risk high-risk:',
      res.status,
      JSON.stringify(res.body).slice(0, 400),
    );
    expect(res.status).toBe(200);

    const unauth = await request(app.getHttpServer()).get(
      '/v1/admin/risk/users/high-risk',
    );
    console.log('SMOKE risk unauth:', unauth.status);
    expect(unauth.status).toBe(401);
  });
});
