import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

jest.mock('firebase-admin', () => ({
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
  auth: () => ({
    verifyIdToken: jest
      .fn()
      .mockResolvedValue({ uid: 'mock-uid', email: 'test@example.com' }),
    getUser: jest
      .fn()
      .mockResolvedValue({ uid: 'mock-uid', email: 'test@example.com' }),
  }),
  messaging: () => ({
    send: jest.fn().mockResolvedValue('mock-message-id'),
  }),
}));

jest.mock('mailgun.js', () => {
  return jest.fn().mockImplementation(() => ({
    client: jest.fn().mockReturnValue({
      messages: {
        create: jest.fn().mockResolvedValue({ id: 'mock-id' }),
      },
    }),
  }));
});

jest.mock('stellar-sdk', () => ({
  Server: jest.fn().mockImplementation(() => ({
    loadAccount: jest.fn().mockResolvedValue({ balances: [] }),
    submitTransaction: jest.fn().mockResolvedValue({ successful: true }),
  })),
  Keypair: {
    random: jest.fn().mockReturnValue({
      publicKey: () => 'mock-public-key',
      secret: () => 'mock-secret',
    }),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  TransactionBuilder: jest.fn(),
  Asset: { native: jest.fn() },
  Operation: { payment: jest.fn() },
}));

describe('Auth Refresh Validation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/auth/refresh with empty body returns 400', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({})
      .expect(400);
  });

  it('POST /v1/auth/refresh with empty refreshToken returns 400', () => {
    return request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: '' })
      .expect(400);
  });
});
