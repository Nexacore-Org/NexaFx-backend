import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DepositModule } from './deposit.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { NotificationsService } from '../notifications/providers/notifications.service';
import { DepositMethod } from './enums/depositMethod.enum';
import { TransactionType } from '../transactions/enums/transaction-type.enum';
import { TransactionStatus } from '../transactions/enums/transaction-status.enum';

describe('DepositController (e2e)', () => {
  let app: INestApplication;
  let transactionRepository: Repository<Transaction>;
  let userRepository: Repository<User>;
  let currencyRepository: Repository<Currency>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockCurrency = {
    id: 'currency-123',
    code: 'USDC',
    name: 'USD Coin',
    type: 'CRYPTO',
    isActive: true,
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DepositModule],
    })
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue({
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        })),
      })
      .overrideProvider(getRepositoryToken(User))
      .useValue({
        findOne: jest.fn().mockResolvedValue(mockUser),
      })
      .overrideProvider(getRepositoryToken(Currency))
      .useValue({
        findOne: jest.fn().mockResolvedValue(mockCurrency),
      })
      .overrideProvider(NotificationsService)
      .useValue({
        create: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    transactionRepository = moduleFixture.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
    currencyRepository = moduleFixture.get<Repository<Currency>>(
      getRepositoryToken(Currency),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/deposit (POST)', () => {
    it('should create a deposit', () => {
      const createDepositDto = {
        currency: 'USDC',
        amount: 100,
        method: DepositMethod.INSTANT,
        description: 'Test deposit',
      };

      const mockTransaction = {
        id: 'transaction-123',
        initiatorId: 'user-123',
        asset: 'USDC',
        type: TransactionType.DEPOSIT,
        amount: 100,
        currencyId: 'currency-123',
        status: TransactionStatus.PENDING,
        reference: 'DEP-20241201-ABC123',
        totalAmount: 100,
        feeAmount: 0,
        metadata: { method: DepositMethod.INSTANT },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest
        .spyOn(transactionRepository, 'create')
        .mockReturnValue(mockTransaction as any);
      jest
        .spyOn(transactionRepository, 'save')
        .mockResolvedValue(mockTransaction as any);

      return request(app.getHttpServer())
        .post('/deposit')
        .send(createDepositDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.currency).toBe('USDC');
          expect(res.body.amount).toBe(100);
        });
    });

    it('should return 400 for invalid amount', () => {
      const createDepositDto = {
        currency: 'USDC',
        amount: 0,
        method: DepositMethod.INSTANT,
      };

      return request(app.getHttpServer())
        .post('/deposit')
        .send(createDepositDto)
        .expect(400);
    });
  });

  describe('/deposit/methods (GET)', () => {
    it('should return available deposit methods', () => {
      return request(app.getHttpServer())
        .get('/deposit/methods')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('methods');
          expect(Array.isArray(res.body.methods)).toBe(true);
          expect(res.body.methods.length).toBeGreaterThan(0);
        });
    });
  });

  describe('/deposit/wallet-address/:currency (GET)', () => {
    it('should generate wallet address for valid currency', () => {
      return request(app.getHttpServer())
        .get('/deposit/wallet-address/USDC')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('address');
          expect(res.body).toHaveProperty('qrCode');
          expect(res.body).toHaveProperty('currency', 'USDC');
          expect(res.body).toHaveProperty('network');
        });
    });

    it('should return 400 for invalid currency', () => {
      jest.spyOn(currencyRepository, 'findOne').mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/deposit/wallet-address/INVALID')
        .expect(400);
    });
  });

  describe('/deposit/history (GET)', () => {
    it('should return deposit history', () => {
      return request(app.getHttpServer())
        .get('/deposit/history')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('deposits');
          expect(res.body).toHaveProperty('pagination');
          expect(Array.isArray(res.body.deposits)).toBe(true);
        });
    });

    it('should return deposit history with pagination parameters', () => {
      return request(app.getHttpServer())
        .get('/deposit/history?page=2&limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.pagination.page).toBe(2);
          expect(res.body.pagination.limit).toBe(5);
        });
    });
  });

  describe('/deposit/:id (GET)', () => {
    it('should return deposit by id', () => {
      const mockTransaction = {
        id: 'transaction-123',
        initiatorId: 'user-123',
        asset: 'USDC',
        type: TransactionType.DEPOSIT,
        amount: 100,
        currencyId: 'currency-123',
        status: TransactionStatus.PENDING,
        reference: 'DEP-20241201-ABC123',
        totalAmount: 100,
        feeAmount: 0,
        metadata: { method: DepositMethod.INSTANT },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest
        .spyOn(transactionRepository, 'findOne')
        .mockResolvedValue(mockTransaction as any);

      return request(app.getHttpServer())
        .get('/deposit/transaction-123')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', 'transaction-123');
          expect(res.body).toHaveProperty('currency', 'USDC');
        });
    });

    it('should return 404 for non-existent deposit', () => {
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/deposit/non-existent')
        .expect(404);
    });
  });

  describe('/deposit/:id/confirm (POST)', () => {
    it('should confirm deposit', () => {
      const pendingTransaction = {
        id: 'transaction-123',
        initiatorId: 'user-123',
        asset: 'USDC',
        type: TransactionType.DEPOSIT,
        amount: 100,
        currencyId: 'currency-123',
        status: TransactionStatus.PENDING,
        reference: 'DEP-20241201-ABC123',
        totalAmount: 100,
        feeAmount: 0,
        metadata: { method: DepositMethod.INSTANT },
        createdAt: new Date(),
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue({
          ...pendingTransaction,
          status: TransactionStatus.COMPLETED,
        }),
      };

      jest
        .spyOn(transactionRepository, 'findOne')
        .mockResolvedValue(pendingTransaction as any);

      return request(app.getHttpServer())
        .post('/deposit/transaction-123/confirm')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', 'transaction-123');
          expect(res.body).toHaveProperty(
            'status',
            TransactionStatus.COMPLETED,
          );
        });
    });

    it('should return 404 for non-existent pending deposit', () => {
      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(null);

      return request(app.getHttpServer())
        .post('/deposit/non-existent/confirm')
        .expect(404);
    });
  });
});
