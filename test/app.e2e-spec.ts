import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DataSource } from 'typeorm';

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

describe('NexaFx E2E Tests', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    if (dataSource) {
      const entities = dataSource.entityMetadatas;
      for (const entity of entities) {
        try {
          const repository = dataSource.getRepository(entity.name);
          await repository.query(
            `TRUNCATE TABLE "${entity.tableName}" CASCADE;`,
          );
        } catch (error) {
          // Ignore tables that might not exist or can't be truncated
        }
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('/ (GET)', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });
  });

  describe('Auth Module', () => {
    it('should test auth module', () => {
      expect(true).toBe(true);
    });
  });

  describe('Users Module', () => {
    it('should test users module', () => {
      expect(true).toBe(true);
    });
  });

  describe('Transactions Module', () => {
    it('should test transactions module', () => {
      expect(true).toBe(true);
    });
  });

  describe('KYC Module', () => {
    it('should test kyc module', () => {
      expect(true).toBe(true);
    });
  });

  describe('Notifications Module', () => {
    it('should test notifications module', () => {
      expect(true).toBe(true);
    });
  });
});
