import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';

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
      publicKey: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY2F3D',
      secret: () => 'SBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
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
 * Create and configure a test NestJS application
 * with mocked external services and proper middleware setup
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const reflector = app.get(Reflector);

  // Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Interceptors
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(reflector),
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );

  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.init();
  return app;
}
