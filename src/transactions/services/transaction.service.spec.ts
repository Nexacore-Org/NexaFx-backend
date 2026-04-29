import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionsService } from './transaction.service';
import { Transaction, TransactionStatus } from '../entities/transaction.entity';
import { CurrenciesService } from '../../currencies/currencies.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { StellarService } from '../../blockchain/stellar/stellar.service';
import { UsersService } from '../../users/users.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ReferralsService } from '../../referrals/referrals.service';
import { FeesService } from '../../fees/fees.service';
import {
  FeeTransactionType,
  FeeType,
} from '../../fees/entities/fee-config.entity';
import { CurrencyPairService } from '../../currencies/services/currency-pair.service';
import { FirebaseService } from '../../firebase/firebase.service';
import { WebhookService } from '../../webhooks/services/webhook.service';
import { TransactionType } from '../entities/transaction.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { BeneficiariesService } from '../../beneficiaries/beneficiaries.service';
import { WalletsService } from '../../wallets/wallets.service';
import { EncryptionService } from '../../common/services/encryption.service';

describe('TransactionsService fee integration behavior', () => {
  let service: TransactionsService;

  const transactionRepository = {
    create: jest.fn((payload: Partial<Transaction>) => ({
      id: 'tx-123',
      ...payload,
    })),
    save: jest.fn(async (payload: Partial<Transaction>) => ({
      id: payload.id ?? 'tx-123',
      ...payload,
    })),
    findOne: jest.fn(),
  };

  const currencyPairService = {
    validatePair: jest.fn(async () => ({ spreadPercent: 0.5 })),
    findByCodes: jest.fn(async () => ({ spreadPercent: 0.5 })),
  };

  const currenciesService = {
    findOne: jest.fn(async () => ({ isActive: true })),
  };

  const exchangeRatesService = {
    getRate: jest.fn(async () => ({ rate: 1 })),
  };

  const stellarService = {
    createTransaction: jest.fn(async () => ({})),
    signTransaction: jest.fn(async () => ({})),
    submitTransaction: jest.fn(async () => ({ hash: 'stellar-hash' })),
    findBestPath: jest.fn(async () => [
      {
        source_amount: '100',
        destination_amount: '100',
        path: [],
      },
    ]),
    buildPathPaymentOp: jest.fn(() => ({})),
  };

  const usersService = {
    findById: jest.fn(async () => ({
      id: 'user-1',
      walletPublicKey:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      walletSecretKeyEncrypted:
        'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      balances: { XLM: 1000 },
    })),
    updateByUserId: jest.fn(async () => undefined),
  };

  const auditLogsService = {
    logTransactionEvent: jest.fn(async () => undefined),
  };

  const referralsService = {
    processReferralReward: jest.fn(async () => undefined),
  };

  const feesService = {
    calculateFee: jest.fn(async () => ({
      feeAmount: 1.25,
      feeCurrency: 'XLM',
      feeType: FeeType.FLAT,
    })),
    recordFee: jest.fn(async () => undefined),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'SWAP_SLIPPAGE_PERCENT') return '0.005';
      return 'S_TEST_HOT_WALLET_SECRET';
    }),
  };

  const firebaseService = {};
  const webhookService = {
    dispatch: jest.fn(async () => undefined),
  };

  const notificationsService = {
    create: jest.fn(async () => undefined),
  };

  const beneficiariesService = {};

  const walletsService = {
    resolveWalletForTransaction: jest.fn(async () => ({
      publicKey:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      encryptedSecretKey:
        'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })),
  };

  const encryptionService = {
    decrypt: jest.fn(
      () => 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        { provide: CurrenciesService, useValue: currenciesService },
        { provide: CurrencyPairService, useValue: currencyPairService },
        { provide: ExchangeRatesService, useValue: exchangeRatesService },
        { provide: StellarService, useValue: stellarService },
        { provide: ConfigService, useValue: configService },
        { provide: FeesService, useValue: feesService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ReferralsService, useValue: referralsService },
        { provide: FirebaseService, useValue: firebaseService },
        { provide: WebhookService, useValue: webhookService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: BeneficiariesService, useValue: beneficiariesService },
        { provide: WalletsService, useValue: walletsService },
        { provide: EncryptionService, useValue: encryptionService },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  it('calls calculateFee and recordFee during deposit', async () => {
    await service.createDeposit('user-1', {
      amount: 100,
      currency: 'XLM',
      sourceAddress: 'G_SOURCE_ADDRESS',
    });

    expect(feesService.calculateFee).toHaveBeenCalledWith(
      FeeTransactionType.DEPOSIT,
      'XLM',
      100,
    );
    expect(feesService.recordFee).toHaveBeenCalledWith(
      'tx-123',
      'user-1',
      expect.objectContaining({
        feeAmount: 1.25,
        feeCurrency: 'XLM',
      }),
    );
  });

  it('calls calculateFee and recordFee during withdrawal', async () => {
    await service.createWithdrawal('user-1', {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(feesService.calculateFee).toHaveBeenCalledWith(
      FeeTransactionType.WITHDRAW,
      'XLM',
      100,
    );
    expect(feesService.recordFee).toHaveBeenCalledWith(
      'tx-123',
      'user-1',
      expect.objectContaining({
        feeAmount: 1.25,
        feeCurrency: 'XLM',
      }),
    );
  });

  it('continues deposit when calculateFee returns zero fee', async () => {
    feesService.calculateFee.mockResolvedValueOnce({
      feeAmount: 0,
      feeCurrency: 'XLM',
      feeType: FeeType.FLAT,
    });

    const transaction = await service.createDeposit('user-1', {
      amount: 50,
      currency: 'XLM',
      sourceAddress: 'G_SOURCE_ADDRESS',
    });

    expect(transaction.feeAmount).toBe('0.00000000');
    expect(feesService.recordFee).toHaveBeenCalledWith(
      'tx-123',
      'user-1',
      expect.objectContaining({ feeAmount: 0 }),
    );
  });

  it('logs and throws when fee recording fails during deposit', async () => {
    feesService.recordFee.mockRejectedValueOnce(new Error('fee write failed'));

    const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

    await expect(
      service.createDeposit('user-1', {
        amount: 25,
        currency: 'XLM',
        sourceAddress: 'G_SOURCE_ADDRESS',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to create deposit transaction',
      expect.any(Error),
    );
  });

  describe('cancelTransaction', () => {
    const makePending = (overrides: Partial<Transaction> = {}): Transaction =>
      ({
        id: 'tx-cancel-test',
        userId: 'user-1',
        status: TransactionStatus.PENDING,
        type: TransactionType.DEPOSIT,
        amount: '100',
        currency: 'XLM',
        txHash: null,
        ...overrides,
      }) as Transaction;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should cancel a PENDING transaction owned by the user', async () => {
      const pending = makePending();
      transactionRepository.findOne.mockResolvedValue(pending);
      transactionRepository.save.mockResolvedValue({
        ...pending,
        status: TransactionStatus.CANCELLED,
      } as Transaction);

      const result = await service.cancelTransaction(
        'tx-cancel-test',
        'user-1',
      );

      expect(result.status).toBe(TransactionStatus.CANCELLED);
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'tx-cancel-test' },
      });
      expect(auditLogsService.logTransactionEvent).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        'tx-cancel-test',
        expect.objectContaining({
          oldStatus: TransactionStatus.PENDING,
          newStatus: TransactionStatus.CANCELLED,
          cancelledBy: 'user-1',
          userCancelled: true,
        }),
      );
    });

    it('should throw ForbiddenException when user tries to cancel another user transaction', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makePending({ userId: 'different-user' }),
      );

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when cancelling a non-PENDING transaction', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makePending({ status: TransactionStatus.SUCCESS }),
      );

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(
        'Cannot cancel transaction with status SUCCESS. Only PENDING transactions can be cancelled.',
      );

      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.cancelTransaction('tx-nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('should log a warning when cancelling a transaction that has a txHash', async () => {
      const transactionWithHash = makePending({
        txHash: 'stellar-hash-123',
      });

      transactionRepository.findOne.mockResolvedValue(transactionWithHash);
      transactionRepository.save.mockResolvedValue({
        ...transactionWithHash,
        status: TransactionStatus.CANCELLED,
      } as Transaction);

      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

      await service.cancelTransaction('tx-cancel-test', 'user-1');

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('has already been submitted to Stellar'),
      );

      expect(auditLogsService.logTransactionEvent).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        'tx-cancel-test',
        expect.objectContaining({
          txHash: 'stellar-hash-123',
        }),
      );
    });
  });
});
