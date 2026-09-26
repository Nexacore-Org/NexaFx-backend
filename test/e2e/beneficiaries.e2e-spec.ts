import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import {
  getLatestOtp,
  setupTestDatabase,
  truncateAll,
} from '../helpers/db.helper';
import {
  Beneficiary,
  BeneficiaryNetwork,
} from '../../src/beneficiaries/entities/beneficiary.entity';

describe('Beneficiaries E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;

  const beneficiaryInput = {
    nickname: 'Savings wallet',
    walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    currency: 'USDC',
    network: BeneficiaryNetwork.STELLAR,
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    const email = 'beneficiaries-user@example.com';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password: 'SecurePassword123!',
        firstName: 'Beneficiary',
        lastName: 'User',
        phone: '+1234567890',
      })
      .expect(200);

    const otp = await getLatestOtp(dataSource, email);
    expect(otp).toBeTruthy();
    const response = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp })
      .expect(200);
    accessToken = response.body.accessToken;
  });

  const authorized = () =>
    request(app.getHttpServer()).set('Authorization', `Bearer ${accessToken}`);

  const createBeneficiary = async (overrides = {}) => {
    const response = await authorized()
      .post('/v1/beneficiaries')
      .send({ ...beneficiaryInput, ...overrides })
      .expect(201);
    return response.body;
  };

  it('creates a beneficiary for the authenticated user', async () => {
    const beneficiary = await createBeneficiary();
    expect(beneficiary).toMatchObject({
      nickname: beneficiaryInput.nickname,
      walletAddress: beneficiaryInput.walletAddress,
      currency: 'USDC',
    });
    expect(beneficiary.id).toBeTruthy();
  });

  it('lists the authenticated user beneficiaries', async () => {
    await createBeneficiary();

    const response = await authorized().get('/v1/beneficiaries').expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ nickname: 'Savings wallet' });
  });

  it('updates an owned beneficiary', async () => {
    const beneficiary = await createBeneficiary();

    const response = await authorized()
      .patch(`/v1/beneficiaries/${beneficiary.id}`)
      .send({ nickname: 'Main wallet' })
      .expect(200);
    expect(response.body).toMatchObject({
      id: beneficiary.id,
      nickname: 'Main wallet',
    });
  });

  it('rejects invalid create and update payloads', async () => {
    await authorized()
      .post('/v1/beneficiaries')
      .send({ ...beneficiaryInput, walletAddress: 'invalid' })
      .expect(400);

    const beneficiary = await createBeneficiary();
    await authorized()
      .patch(`/v1/beneficiaries/${beneficiary.id}`)
      .send({ walletAddress: 'invalid' })
      .expect(400);
  });

  it('sets an owned beneficiary as the default', async () => {
    const beneficiary = await createBeneficiary();

    const response = await authorized()
      .patch(`/v1/beneficiaries/${beneficiary.id}/set-default`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: beneficiary.id,
      isDefault: true,
    });
  });

  it('deletes an owned beneficiary', async () => {
    const beneficiary = await createBeneficiary();

    await authorized()
      .delete(`/v1/beneficiaries/${beneficiary.id}`)
      .expect(204);
    await expect(
      dataSource.getRepository(Beneficiary).findOneBy({ id: beneficiary.id }),
    ).resolves.toBeNull();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/v1/beneficiaries').expect(401);
    await request(app.getHttpServer())
      .post('/v1/beneficiaries')
      .send(beneficiaryInput)
      .expect(401);
  });
});
