import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Writable } from 'stream';
import { once } from 'events';
import { createAdminSession, createE2eApp, signupAndVerifyUser } from '../helpers/e2e-app';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../src/users/users.service';
import { KycService } from '../../src/kyc/kyc.service';
import { DocumentType, KycStatus } from '../../src/kyc/entities/kyc.entity';
import { TransactionsService } from '../../src/transactions/services/transaction.service';
import { ExchangeRatesService } from '../../src/exchange-rates/exchange-rates.service';
import { ReceiptsService } from '../../src/receipts/receipts.service';

function getUserIdFromToken(app: INestApplication, accessToken: string): string {
  const jwtService = app.get(JwtService);
  const payload = jwtService.verify<{ sub: string }>(accessToken);
  return payload.sub;
}

function createMockResponse() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  return Object.assign(stream, {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    get body() {
      return Buffer.concat(chunks).toString('utf8');
    },
    get headers() {
      return headers;
    },
  });
}

describe('Complete User Journey (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('completes registration, KYC, wallet, funding, FX lookup, and compliance export', async () => {
    const user = await signupAndVerifyUser(app);
    await createAdminSession(app);

    const userId = getUserIdFromToken(app, user.accessToken);
    const usersService = app.get(UsersService);
    const kycService = app.get(KycService);
    const transactionsService = app.get(TransactionsService);
    const exchangeRatesService = app.get(ExchangeRatesService);
    const receiptsService = app.get(ReceiptsService);

    const profile = await usersService.getProfile(userId);
    expect(profile.email).toBe(user.email);
    expect(profile.walletPublicKey).toBeDefined();

    const kycSubmission = await kycService.submitKyc(userId, {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'A1234567',
      selfieUrl: 'https://example.com/selfie.jpg',
      dateOfBirth: '1990-01-01',
      nationality: 'NG',
      documentFrontUrl: 'https://example.com/front.jpg',
      documentBackUrl: 'https://example.com/back.jpg',
    });
    expect(kycSubmission.status).toBe('pending');

    const pendingKyc = await kycService.getPendingKycSubmissions();
    expect(pendingKyc).toHaveLength(1);

    await kycService.reviewKyc(pendingKyc[0].id, KycStatus.APPROVED);

    const kycStatus = await kycService.getKycStatus(userId);
    expect(kycStatus.status).toBe('approved');

    const walletBalances = await usersService.getWalletBalances(userId);
    expect(walletBalances.walletPublicKey).toBeDefined();
    expect(Array.isArray(walletBalances.balances)).toBe(true);

    const deposit = await transactionsService.createDeposit(userId, {
      amount: 125,
      currency: 'USD',
      sourceAddress: 'GSOURCEACCOUNTTESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(deposit.id).toBeDefined();
    expect(deposit.txHash).toContain('fake-hash-');

    const fxRate = await exchangeRatesService.getRate('EUR', 'USD');
    expect(fxRate.rate).toBeGreaterThan(0);

    const month = new Date().toISOString().slice(0, 7);
    const response = createMockResponse();
    const finished = once(response, 'finish');
    await receiptsService.exportTransactionsCSV(userId, month, response);
    await finished;

    expect(response.getHeader('content-type')).toContain('text/csv');
    expect(response.getHeader('content-disposition')).toContain(
      `transactions-${month}.csv`,
    );
  });
});
