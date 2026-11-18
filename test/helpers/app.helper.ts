import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap/configure-app';

/**
 * Mock Firebase Admin SDK
 */
jest.mock('firebase-admin', () => ({
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'mock-uid',
      email: 'test@example.com',
    }),
    getUser: jest.fn().mockResolvedValue({
      uid: 'mock-uid',
      email: 'test@example.com',
    }),
  }),
  messaging: () => ({
    send: jest.fn().mockResolvedValue('mock-message-id'),
  }),
}));

/**
 * Mock Mailgun JS
 */
jest.mock('mailgun.js', () => {
  return jest.fn().mockImplementation(() => ({
    client: jest.fn().mockReturnValue({
      messages: {
        create: jest.fn().mockResolvedValue({ id: 'mock-id' }),
      },
    }),
  }));
});

/**
 * Mock Stellar SDK
 */
jest.mock('stellar-sdk', () => ({
  Server: jest.fn().mockImplementation(() => ({
    loadAccount: jest.fn().mockResolvedValue({
      balances: [
        {
          balance: '1000',
          asset_type: 'native',
        },
      ],
    }),
    submitTransaction: jest.fn().mockResolvedValue({
      successful: true,
      hash: 'mock-tx-hash',
    }),
  })),
  Keypair: {
    random: jest.fn().mockReturnValue({
      publicKey: () =>
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY2F3D',
      secret: () =>
        'SBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    }),
  },
  Networks: {
    TESTNET_PASSPHRASE: 'Test SDF Network ; September 2015',
    PUBLIC_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
  },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    setBaseFee: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      toXDR: jest.fn().mockReturnValue('mock-xdr'),
    }),
  })),
  Asset: {
    native: jest.fn().mockReturnValue({}),
  },
  Operation: {
    payment: jest.fn().mockReturnValue({}),
  },
}));

/**
 * Mock Stripe SDK (Stripe Issuing) — no real external network calls.
 * The concrete mock lives in test/mocks/stripe.mock.ts so specs can override it.
 */
jest.mock('stripe', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stripeMock = require('../mocks/stripe.mock');
  return {
    __esModule: true,
    default: stripeMock.default,
    Stripe: stripeMock.default,
  };
});

/**
 * Create and configure a test NestJS application
 * with mocked external services and proper middleware setup
 */
export async function createTestApp(
  configure?: (app: INestApplication) => void,
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  configureApp(app, { transformOptions: { enableImplicitConversion: true } });

  configure?.(app);

  await app.init();
  return app;
}
