import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 100),
  duration: __ENV.K6_DURATION || '60s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<200'],
  },
};

const baseURL = __ENV.BASE_URL || 'http://127.0.0.1:3001';
const otp = __ENV.OTP_FIXED_CODE || '123456';

function unwrap(response: http.Response<any>) {
  const parsed = response.json() as { data?: Record<string, unknown> };
  return parsed.data ?? parsed;
}

export default function () {
  const suffix = `${__VU}-${__ITER}-${Date.now()}`;
  const email = `load-${suffix}@nexafx.test`;
  const password = 'SecurePassword123!';

  const signupResponse = http.post(
    `${baseURL}/v1/auth/signup`,
    JSON.stringify({
      email,
      password,
      firstName: 'Load',
      lastName: 'User',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );

  check(signupResponse, {
    'signup accepted': (response) => response.status === 200,
  });

  const verifyResponse = http.post(
    `${baseURL}/v1/auth/verify-signup-otp`,
    JSON.stringify({ email, otp }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );

  check(verifyResponse, {
    'signup verification succeeded': (response) => response.status === 200,
  });

  const auth = unwrap(verifyResponse);
  const accessToken = String(auth.accessToken || '');
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const walletResponse = http.get(`${baseURL}/v1/users/wallet/balances`, {
    headers: authHeaders,
  });
  check(walletResponse, {
    'wallet balances returned': (response) => response.status === 200,
  });

  const transactionResponse = http.post(
    `${baseURL}/v1/transactions/deposit`,
    JSON.stringify({
      amount: 25,
      currency: 'USD',
      sourceAddress: `GSOURCE${suffix}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
    }),
    {
      headers: authHeaders,
    },
  );
  check(transactionResponse, {
    'deposit created': (response) => response.status === 201,
  });

  const fxResponse = http.get(`${baseURL}/v1/exchange-rates?from=EUR&to=USD`);
  check(fxResponse, {
    'fx rate returned': (response) => response.status === 200,
  });

  sleep(1);
}
