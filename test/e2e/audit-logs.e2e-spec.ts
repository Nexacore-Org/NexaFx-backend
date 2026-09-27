import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import { getLatestOtp, setupTestDatabase, truncateAll } from '../helpers/db.helper';
import { AuditLog } from '../../src/audit-logs/entities/audit-log.entity';
import { AuditLogExportJob, ExportFormat, ExportJobStatus } from '../../src/audit-logs/entities/audit-log-export-job.entity';

describe('Audit logs E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    await truncateAll(dataSource);
    const email = 'audit-admin@example.com';
    await request(app.getHttpServer()).post('/v1/auth/signup').send({
      email,
      password: 'AdminPassword123!',
      firstName: 'Audit',
      lastName: 'Admin',
      phone: '+12345678002',
    }).expect(200);
    const otp = await getLatestOtp(dataSource, email);
    const auth = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp').send({ email, otp }).expect(200);
    token = auth.body.accessToken;
    await dataSource.query('UPDATE "users" SET role = $1 WHERE email = $2', ['SUPER_ADMIN', email]);
    const users = await dataSource.query('SELECT id FROM "users" WHERE email = $1', [email]);
    userId = users[0].id;
    await dataSource.getRepository(AuditLog).save({
      actorId: userId,
      action: 'LOGIN',
      resourceType: 'AUTH',
      resourceId: null,
      status: 'SUCCESS',
      isSensitive: false,
    });
  });

  it('queries privileged and personal logs, exports CSV, polls and downloads an export, and schedules delivery', async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const logs = await request(app.getHttpServer()).get('/v1/audit-logs').set(headers).expect(200);
    expect(JSON.stringify(logs.body)).toContain('LOGIN');
    const mine = await request(app.getHttpServer()).get('/v1/audit-logs/my-logs').set(headers).expect(200);
    expect(JSON.stringify(mine.body)).toContain('LOGIN');

    await request(app.getHttpServer()).post('/v1/audit-logs/export').set(headers)
      .send({ format: 'CSV' }).expect(200).expect('Content-Type', /text\/csv/);

    const job = await dataSource.getRepository(AuditLogExportJob).save({
      adminUserId: userId,
      status: ExportJobStatus.COMPLETED,
      format: ExportFormat.CSV,
      filters: {},
      filename: 'audit.csv',
      recordCount: 1,
    });
    await request(app.getHttpServer()).get(`/v1/audit-logs/jobs/${job.id}`).set(headers).expect(200);
    await request(app.getHttpServer()).get(`/v1/audit-logs/jobs/${job.id}/download`).set(headers).expect(200);
    await request(app.getHttpServer()).post('/v1/audit-logs/schedule').set(headers)
      .send({ email: 'compliance@example.com' }).expect(201);
  });

  it('rejects unauthenticated access to protected log endpoints', async () => {
    await request(app.getHttpServer()).get('/v1/audit-logs').expect(401);
    await request(app.getHttpServer()).get('/v1/audit-logs/my-logs').expect(401);
    await request(app.getHttpServer()).post('/v1/audit-logs/export').send({ format: 'CSV' }).expect(401);
    await request(app.getHttpServer()).get('/v1/audit-logs/jobs/00000000-0000-0000-0000-000000000001').expect(401);
    await request(app.getHttpServer()).get('/v1/audit-logs/jobs/00000000-0000-0000-0000-000000000001/download').expect(401);
    await request(app.getHttpServer()).post('/v1/audit-logs/schedule').send({ email: 'a@example.com' }).expect(401);
  });

  it('validates export format and scheduled delivery email', async () => {
    const headers = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer()).post('/v1/audit-logs/export').set(headers)
      .send({ format: 'XML' }).expect(400);
    await request(app.getHttpServer()).post('/v1/audit-logs/schedule').set(headers)
      .send({ email: 'invalid-email' }).expect(400);
  });
});
