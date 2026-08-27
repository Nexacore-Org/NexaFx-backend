import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FiatService } from './fiat.service';
import { FiatDeposit, FiatDepositStatus } from './entities/fiat-deposit.entity';
import { FiatWithdrawal } from './entities/fiat-withdrawal.entity';
import { User } from '../../users/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';
import { FlutterwaveProvider } from './providers/flutterwave.provider';

describe('FiatService', () => {
  let service: FiatService;
  let depositRepository: DeepMockProxy<any>;
  let withdrawalRepository: DeepMockProxy<any>;
  let userRepository: DeepMockProxy<any>;
  let walletRepository: DeepMockProxy<any>;
  let kycRepository: DeepMockProxy<any>;
  let configService: DeepMockProxy<ConfigService>;
  let dataSource: DeepMockProxy<DataSource>;
  let notificationsService: DeepMockProxy<NotificationsService>;
  let flutterwaveProvider: DeepMockProxy<FlutterwaveProvider>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiatService,
        {
          provide: getRepositoryToken(FiatDeposit),
          useValue: mock(),
        },
        {
          provide: getRepositoryToken(FiatWithdrawal),
          useValue: mock(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: mock(),
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mock(),
        },
        {
          provide: getRepositoryToken(KycRecord),
          useValue: mock(),
        },
        {
          provide: ConfigService,
          useValue: mock<ConfigService>(),
        },
        {
          provide: DataSource,
          useValue: mock<DataSource>(),
        },
        {
          provide: NotificationsService,
          useValue: mock<NotificationsService>(),
        },
        {
          provide: FlutterwaveProvider,
          useValue: mock<FlutterwaveProvider>(),
        },
      ],
    }).compile();

    service = module.get<FiatService>(FiatService);
    depositRepository = module.get(getRepositoryToken(FiatDeposit));
    withdrawalRepository = module.get(getRepositoryToken(FiatWithdrawal));
    userRepository = module.get(getRepositoryToken(User));
    walletRepository = module.get(getRepositoryToken(Wallet));
    kycRepository = module.get(getRepositoryToken(KycRecord));
    configService = module.get(ConfigService);
    dataSource = module.get(DataSource);
    notificationsService = module.get(NotificationsService);
    flutterwaveProvider = module.get(FlutterwaveProvider);

    // Mock the provider instantiation in the service constructor
    (service as any).provider = flutterwaveProvider;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processDepositWebhook', () => {
    it('should process a successful deposit webhook', async () => {
      const payload = {
        event: 'payment.completed',
        data: {
          tx_ref: 'test-ref',
          status: 'successful',
          flw_ref: 'flw-ref-123',
          processor_response: 'Approved',
        },
      };
      const signature = 'test-signature';
      const deposit = {
        reference: 'test-ref',
        status: FiatDepositStatus.PENDING,
        userId: 'user-1',
        amount: '100',
        currency: 'NGN',
        save: jest.fn(),
      };

      flutterwaveProvider.verifyWebhookSignature.mockReturnValue(true);
      depositRepository.findOne.mockResolvedValue(deposit);
      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(deposit),
          save: jest.fn(),
        };
        return cb(manager as any);
      });

      const result = await service.processDepositWebhook(payload, signature);

      expect(result.success).toBe(true);
      expect(deposit.status).toBe(FiatDepositStatus.COMPLETED);
      expect(deposit.providerReference).toBe('flw-ref-123');
    });

    it('should process a failed deposit webhook', async () => {
      const payload = {
        event: 'payment.failed',
        data: {
          tx_ref: 'test-ref',
          status: 'failed',
          processor_response: 'Insufficient Funds',
        },
      };
      const signature = 'test-signature';
      const deposit = {
        reference: 'test-ref',
        status: FiatDepositStatus.PENDING,
        userId: 'user-1',
        amount: '100',
        currency: 'NGN',
        save: jest.fn(),
      };

      flutterwaveProvider.verifyWebhookSignature.mockReturnValue(true);
      depositRepository.findOne.mockResolvedValue(deposit);
      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(deposit),
          save: jest.fn(),
        };
        return cb(manager as any);
      });

      const result = await service.processDepositWebhook(payload, signature);

      expect(result.success).toBe(true);
      expect(deposit.status).toBe(FiatDepositStatus.FAILED);
      expect(deposit.failureReason).toBe('Insufficient Funds');
    });
  });

  describe('initiateDeposit', () => {
    it('should initiate a deposit', async () => {
      const dto = { amount: 100, currency: 'NGN' };
      const user = { id: 'user-1' };
      const depositResult = {
        reference: 'test-ref',
        paymentLink: 'http://example.com',
        expiresAt: new Date(),
      };

      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(user),
          create: jest.fn().mockImplementation((_, d) => d),
          save: jest.fn(),
        };
        flutterwaveProvider.initiateDeposit.mockResolvedValue(depositResult);
        return cb(manager as any);
      });

      const result = await service.initiateDeposit('user-1', dto);

      expect(result.reference).toBe(depositResult.reference);
      expect(result.paymentLink).toBe(depositResult.paymentLink);
    });
  });

  describe('initiateWithdrawal', () => {
    it('should initiate a withdrawal', async () => {
      const dto = {
        amount: 100,
        currency: 'NGN',
        bankCode: '044',
        accountNumber: '1234567890',
      };
      const user = { id: 'user-1' };
      const kyc = { status: 'APPROVED' };
      const wallet = { balance: '200.00' };
      const bankVerification = { accountName: 'Test User' };
      const withdrawalResult = {
        reference: 'wd-ref',
        estimatedArrival: new Date(),
      };

      dataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockImplementation((entity) => {
            if (entity === User) return user;
            if (entity === KycRecord) return kyc;
            if (entity === Wallet) return wallet;
            return null;
          }),
          create: jest.fn().mockImplementation((_, d) => d),
          save: jest.fn(),
        };
        flutterwaveProvider.verifyBankAccount.mockResolvedValue(
          bankVerification,
        );
        flutterwaveProvider.initiateWithdrawal.mockResolvedValue(
          withdrawalResult,
        );
        return cb(manager as any);
      });

      const result = await service.initiateWithdrawal('user-1', dto);

      expect(result.reference).toBe(withdrawalResult.reference);
      expect(result.accountName).toBe(bankVerification.accountName);
    });
  });
});
