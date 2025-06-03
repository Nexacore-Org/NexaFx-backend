import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { getConnection } from 'typeorm';

describe('Transfer Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule], // include full app for realistic test
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await getConnection().close();
    await app.close();
  });

  it('/POST transfer - success', async () => {
    const res = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromWalletId: 'valid-sender-id',
        toWalletId: 'valid-recipient-id',
        amount: 10,
        rateLockId: 'valid-ratelock',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('transactionId');
  });

  it('/POST transfer - fail if blacklisted', async () => {
    const res = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromWalletId: 'valid-sender-id',
        toWalletId: 'blacklisted-wallet-id',
        amount: 10,
        rateLockId: 'valid-ratelock',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('blacklisted');
  });

});
