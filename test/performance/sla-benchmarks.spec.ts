import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { api, createE2eApp, signupAndVerifyUser } from '../helpers/e2e-app';

function percentile(values: number[], target: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((target / 100) * sorted.length) - 1,
  );
  return sorted[index];
}

async function measure(fn: () => Promise<void>, iterations: number) {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return {
    samples,
    p99: percentile(samples, 99),
  };
}

describe('SLA Benchmarks', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
    const user = await signupAndVerifyUser(app);
    token = user.accessToken;

    await api(app)
      .get('/v1/users/wallet/balances')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await api(app)
      .get('/v1/exchange-rates')
      .query({ from: 'EUR', to: 'USD' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps transaction creation under the configured p99 threshold', async () => {
    const threshold = Number(process.env.TRANSACTION_P99_BUDGET_MS ?? 200);
    const result = await measure(
      async () => {
        await api(app)
          .post('/v1/transactions/deposit')
          .set('Authorization', `Bearer ${token}`)
          .send({
            amount: 25,
            currency: 'USD',
            sourceAddress: 'GSOURCEACCOUNTTESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          })
          .expect(201);
      },
      25,
    );

    expect(result.p99).toBeLessThan(threshold);
  });

  it('keeps cached wallet balance queries under the configured p99 threshold', async () => {
    const threshold = Number(process.env.BALANCE_P99_BUDGET_MS ?? 50);
    const result = await measure(
      async () => {
        const response = await api(app)
          .get('/v1/users/wallet/balances')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.data.cached).toBe(true);
      },
      40,
    );

    expect(result.p99).toBeLessThan(threshold);
  });

  it('keeps cached FX-rate queries under the configured p99 threshold', async () => {
    const threshold = Number(process.env.FX_RATE_P99_BUDGET_MS ?? 100);
    const result = await measure(
      async () => {
        await api(app)
          .get('/v1/exchange-rates')
          .query({ from: 'EUR', to: 'USD' })
          .expect(200);
      },
      40,
    );

    expect(result.p99).toBeLessThan(threshold);
  });
});
