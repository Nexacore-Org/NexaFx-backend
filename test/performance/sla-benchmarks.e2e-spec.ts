import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { createE2eApp, signupAndVerifyUser } from '../helpers/e2e-app';
import { UsersService } from '../../src/users/users.service';
import { ExchangeRatesService } from '../../src/exchange-rates/exchange-rates.service';
import { TransactionsService } from '../../src/transactions/services/transaction.service';

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

function getUserIdFromToken(app: INestApplication, accessToken: string): string {
  const jwtService = app.get(JwtService);
  const payload = jwtService.verify<{ sub: string }>(accessToken);
  return payload.sub;
}

describe('SLA Benchmarks', () => {
  let app: INestApplication;
  let userId: string;
  let usersService: UsersService;
  let exchangeRatesService: ExchangeRatesService;
  let transactionsService: TransactionsService;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
    const user = await signupAndVerifyUser(app);
    userId = getUserIdFromToken(app, user.accessToken);

    usersService = app.get(UsersService);
    exchangeRatesService = app.get(ExchangeRatesService);
    transactionsService = app.get(TransactionsService);

    await usersService.getWalletBalances(userId);
    await exchangeRatesService.getRate('EUR', 'USD');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('keeps transaction creation under the configured p99 threshold', async () => {
    const threshold = Number(process.env.TRANSACTION_P99_BUDGET_MS ?? 200);
    const result = await measure(
      async () => {
        await transactionsService.createDeposit(userId, {
          amount: 25,
          currency: 'USD',
          sourceAddress: 'GSOURCEACCOUNTTESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        });
      },
      25,
    );

    expect(result.p99).toBeLessThan(threshold);
  });

  it('keeps cached wallet balance queries under the configured p99 threshold', async () => {
    const threshold = Number(process.env.BALANCE_P99_BUDGET_MS ?? 50);
    const result = await measure(
      async () => {
        const response = await usersService.getWalletBalances(userId);
        expect(response.cached).toBe(true);
      },
      40,
    );

    expect(result.p99).toBeLessThan(threshold);
  });

  it('keeps cached FX-rate queries under the configured p99 threshold', async () => {
    const threshold = Number(process.env.FX_RATE_P99_BUDGET_MS ?? 100);
    const result = await measure(
      async () => {
        await exchangeRatesService.getRate('EUR', 'USD');
      },
      40,
    );

    expect(result.p99).toBeLessThan(threshold);
  });
});
