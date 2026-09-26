import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import { getLatestOtp, setupTestDatabase, truncateAll } from '../helpers/db.helper';

describe('Admin bulk E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await truncateAll(dataSource);
    const email = 'bulk-admin@example.com';
    await request(app.getHttpServer()).post('/v1/auth/signup').send({
      email,
      password: 'AdminPassword123!',
      firstName: 'Bulk',
      lastName: 'Admin',
      phone: '+12345678001',
    }).expect(200);
    const otp = await getLatestOtp(dataSource, email);
    const auth = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp').send({ email, otp }).expect(200);
    token = auth.body.accessToken;
    await dataSource.query('UPDATE "users" SET role = $1 WHERE email = $2', ['ADMIN', email]);
  });

  it('previews and executes a bulk action, then returns its status', async () => {
    const preview = await request(app.getHttpServer())
      .post('/v1/admin/bulk/bulk_user_suspend/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetIds: ['00000000-0000-0000-0000-000000000001'] })
      .expect(201);
    expect(preview.body.count).toBe(1);
    const id = preview.body.bulkActionId;

    await request(app.getHttpServer())
      .post('/v1/admin/bulk/bulk_user_suspend/execute')
      .set('Authorization', `Bearer ${token}`)
      .send({ bulkActionId: id }).expect(201);

    const status = await request(app.getHttpServer())
      .get(`/v1/admin/bulk/${id}/status`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(status.body).toMatchObject({ total: 1, status: 'PROCESSING' });
  });

  it('rejects unauthenticated preview, execute, and status requests', async () => {
    await request(app.getHttpServer()).post('/v1/admin/bulk/ban/preview').send({ targetIds: ['x'] }).expect(401);
    await request(app.getHttpServer()).post('/v1/admin/bulk/ban/execute').send({ bulkActionId: 'x' }).expect(401);
    await request(app.getHttpServer()).get('/v1/admin/bulk/x/status').expect(401);
  });

  it('rejects an empty target list', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/bulk/ban/preview')
      .set('Authorization', `Bearer ${token}`).send({ targetIds: [] }).expect(400);
  });
});
