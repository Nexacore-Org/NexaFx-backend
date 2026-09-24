import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, getLatestOtp, setupTestDatabase } from '../helpers/db.helper';
import { v4 as uuidv4 } from 'uuid';

describe('Batches E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;

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

    const email = 'batch-test@example.com';
    const password = 'TestPassword123!';

    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password,
        firstName: 'Batch',
        lastName: 'Test',
        phone: '+1234567891',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    const signupResponse = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);

    userToken = signupResponse.body.accessToken;
  });

  describe('POST /v2/batches/:id/execute', () => {
    it('should execute a batch successfully', async () => {
      const batchId = uuidv4();
      const response = await request(app.getHttpServer())
        .post(`/v2/batches/${batchId}/execute`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          reference: 'test-reference',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id', batchId);
      expect(response.body).toHaveProperty('status', 'SUCCESS');
      expect(response.body).toHaveProperty('currency', 'XLM');
    });

    it('should require authentication', async () => {
      const batchId = uuidv4();
      await request(app.getHttpServer())
        .post(`/v2/batches/${batchId}/execute`)
        .set('Idempotency-Key', uuidv4())
        .send({
          reference: 'test-reference',
        })
        .expect(401);
    });

    it('should return 400 for validation failure (invalid body)', async () => {
      const batchId = uuidv4();
      await request(app.getHttpServer())
        .post(`/v2/batches/${batchId}/execute`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          reference: 12345, // Invalid type, should be string
          extraField: 'not allowed', // Not in whitelist
        })
        .expect(400);
    });
  });
});
