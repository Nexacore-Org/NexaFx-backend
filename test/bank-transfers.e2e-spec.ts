import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { api, createE2eApp, signupAndVerifyUser } from './helpers/e2e-app';
import { BankAccount } from '../src/modules/banking/entities/bank-account.entity';
import { UsersService } from '../src/users/users.service';

describe('Bank Transfers (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.PAYMENT_RAIL_SETTLEMENT_DELAY_MS = '10000';
    ({ app, dataSource } = await createE2eApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('links, verifies, deposits, settles, withdraws, and reverses failed bank transfers', async () => {
    const { accessToken, email } = await signupAndVerifyUser(app);
    const client = api(app);
    const usersService = app.get(UsersService);

    const linkResponse = await client
      .post('/v1/bank-accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bankName: 'Example Bank',
        accountHolderName: 'Test User',
        accountNumber: '0123456789',
        routingNumber: '110000000',
      })
      .expect(201);

    expect(linkResponse.body.data.accountNumberLast4).toBe('6789');

    const bankAccountRepository = dataSource.getRepository(BankAccount);
    const storedAccount = await bankAccountRepository.findOneByOrFail({
      id: linkResponse.body.data.id,
    });

    expect(storedAccount.accountNumberEncrypted).not.toBe('0123456789');
    expect(Number(storedAccount.microDeposit1)).toBeLessThan(1);
    expect(Number(storedAccount.microDeposit2)).toBeLessThan(1);

    const verifyResponse = await client
      .post(`/v1/bank-accounts/${storedAccount.id}/verify`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        amount1: Number(storedAccount.microDeposit1),
        amount2: Number(storedAccount.microDeposit2),
      })
      .expect(201);

    expect(verifyResponse.body.data.status).toBe('ACTIVE');

    const depositResponse = await client
      .post('/v1/deposits/bank')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bankAccountId: storedAccount.id,
        amount: 150,
        currency: 'USD',
      })
      .expect(201);

    expect(depositResponse.body.data.status).toBe('PENDING');

    await client
      .post('/v1/banking/webhooks/payment-rail')
      .send({
        reference: depositResponse.body.data.externalReference,
        status: 'COMPLETED',
      })
      .expect(201);

    const depositedUser = await usersService.findByEmail(email);
    expect(depositedUser?.balances?.USD).toBe(150);

    await usersService.updateByUserId(depositedUser!.id, {
      balances: { ...(depositedUser?.balances ?? {}), USD: 200 },
    });

    const withdrawalResponse = await client
      .post('/v1/withdrawals/bank')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bankAccountId: storedAccount.id,
        amount: 80,
        currency: 'USD',
      })
      .expect(201);

    expect(withdrawalResponse.body.data.status).toBe('PENDING');

    const afterReservationUser = await usersService.findByEmail(email);
    expect(afterReservationUser?.balances?.USD).toBe(120);

    await client
      .post('/v1/banking/webhooks/payment-rail')
      .send({
        reference: withdrawalResponse.body.data.externalReference,
        status: 'FAILED',
        failureReason: 'Mock rail failure',
      })
      .expect(201);

    const afterFailureUser = await usersService.findByEmail(email);
    expect(afterFailureUser?.balances?.USD).toBe(200);
  });
});
