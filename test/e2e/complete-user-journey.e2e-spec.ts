import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createAdminSession, createE2eApp, signupAndVerifyUser, api } from '../helpers/e2e-app';

describe('Complete User Journey (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('completes registration, KYC, wallet, funding, FX lookup, and compliance export', async () => {
    const user = await signupAndVerifyUser(app);
    const admin = await createAdminSession(app);
    const client = api(app);

    const profileResponse = await client
      .get('/v1/users/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(profileResponse.body.data.email).toBe(user.email);
    expect(profileResponse.body.data.walletPublicKey).toBeDefined();

    const kycSubmission = await client
      .post('/v1/kyc/submit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        fullName: 'Test User',
        documentType: 'passport',
        documentNumber: 'A1234567',
        selfieUrl: 'https://example.com/selfie.jpg',
        dateOfBirth: '1990-01-01',
        nationality: 'NG',
        documentFrontUrl: 'https://example.com/front.jpg',
        documentBackUrl: 'https://example.com/back.jpg',
      })
      .expect(201);

    expect(kycSubmission.body.data.status).toBe('pending');

    const pendingKyc = await client
      .get('/v1/kyc/pending')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(pendingKyc.body.data).toHaveLength(1);

    await client
      .patch(`/v1/kyc/${pendingKyc.body.data[0].id}/review`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        decision: 'approved',
      })
      .expect(200);

    const kycStatus = await client
      .get('/v1/kyc/status')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(kycStatus.body.data.status).toBe('approved');

    const walletBalances = await client
      .get('/v1/users/wallet/balances')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(walletBalances.body.data.walletPublicKey).toBeDefined();
    expect(Array.isArray(walletBalances.body.data.balances)).toBe(true);

    const deposit = await client
      .post('/v1/transactions/deposit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        amount: 125,
        currency: 'USD',
        sourceAddress: 'GSOURCEACCOUNTTESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      })
      .expect(201);

    expect(deposit.body.data.id).toBeDefined();
    expect(deposit.body.data.txHash).toContain('fake-hash-');

    const fxRate = await client
      .get('/v1/exchange-rates')
      .query({ from: 'EUR', to: 'USD' })
      .expect(200);

    expect(fxRate.body.data.rate).toBeGreaterThan(0);

    const month = new Date().toISOString().slice(0, 7);
    const exportResponse = await client
      .get('/v1/receipts/export')
      .query({ format: 'csv', month })
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(exportResponse.headers['content-type']).toContain('text/csv');
  });
});
