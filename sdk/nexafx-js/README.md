# NexaFx JavaScript SDK

TypeScript client for core NexaFX APIs with generated OpenAPI types, built on native `fetch` and `WebSocket`.

## Install

```bash
npm install @nexacore-org/nexafx-js
```

## Generate types

From the backend root:

```bash
npm run sdk:openapi
cd sdk/nexafx-js
npm install
npm run generate:types
```

## Create a client

```ts
import { NexaFxClient } from '@nexacore-org/nexafx-js';

const client = new NexaFxClient({
  baseURL: 'https://api.nexafx.com',
});
```

## Login and token storage

```ts
const client = new NexaFxClient({
  baseURL: 'https://api.nexafx.com',
});

await client.auth.login({
  email: 'trader@nexafx.com',
  password: 'CorrectHorseBatteryStaple!123',
  otp: '123456',
});
```

If the backend returns `accessToken` or `refreshToken`, the SDK stores them automatically and retries one failed `401` request by calling `/v1/auth/refresh`.

## Create a transaction

```ts
const transaction = await client.transactions.create({
  type: 'deposit',
  amount: 100.5,
  currency: 'XLM',
  sourceAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
});
```

## Iterate paginated transactions

```ts
for await (const item of client.transactions.iterate({ limit: 50 })) {
  console.log(item.id, item.status);
}
```

## Subscribe to prices

```ts
const unsubscribe = client.websocket.subscribeToPrices(['EURUSD'], (price) => {
  console.log(price.symbol, price.bid, price.ask);
});

unsubscribe();
```

## Build

```bash
npm run build
```
