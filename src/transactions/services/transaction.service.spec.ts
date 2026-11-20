import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Asset, Operation } from 'stellar-sdk';
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
import { LedgerService } from '../../ledger/services/ledger.service';
import { TransactionLimitService } from './transaction-limit.service';
import { RedisService } from '../../modules/redis/redis.service';
import { TransactionCategory } from '../../analytics/entities/transaction-category.entity';
import { AmlService } from '../../modules/compliance/aml.service';
import { MicroSavingsService } from '../../modules/micro-savings/micro-savings.service';
import { UnifiedActivityFeedService } from '../../unified-activity-feed/unified-activity-feed.service';
import { TAX_QUEUE } from '../../modules/queues/queue.constants';

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
    getCurrency: jest.fn(async () => ({ isActive: true, code: 'XLM' })),
  };

  const exchangeRatesService = {
    getRate: jest.fn(async () => ({ rate: 1 })),
    getFreshRate: jest.fn(async () => ({ rate: 1 })),
  };

  const stellarService = {
    createTransaction: jest.fn(async () => ({})),
    signTransaction: jest.fn(async () => ({})),
    submitTransaction: jest.fn(async () => ({ hash: 'stellar-hash' })),
    sendPayment: jest.fn(async () => ({ hash: 'stellar-hash' })),
    findIncomingPayment: jest.fn(async () => null),
    verifyTransaction: jest.fn(async () => ({ status: 'SUCCESS' })),
    getWalletBalances: jest.fn(async () => [{ asset: 'XLM', balance: '100' }]),
    getAssetWithDefaultIssuer: jest.fn(() => Asset.native()),
    getAsset: jest.fn((code: string) => ({ code })),
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
      balances: { XLM: 1000, USDC: 1000 },
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
      publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      encryptedSecretKey:
        'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })),
  };

  const encryptionService = {
    decrypt: jest.fn(
      () => 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ),
  };
  const ledgerService = {
    record: jest.fn(async () => undefined),
  };
  const transactionLimitService = {
    check: jest.fn(async () => undefined),
    withLimitCheck: jest.fn(
      async (
        _userId: string,
        _amount: number,
        _currency: string,
        operation: () => Promise<unknown>,
      ) => operation(),
    ),
  };
  const queryRunner = {
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    manager: {
      save: jest.fn(async (_entity: unknown, payload: any) => payload),
    },
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const mockRedisService = {
    del: jest.fn(),
    delete: jest.fn(),
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
        {
          provide: getRepositoryToken(TransactionCategory),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        { provide: CurrenciesService, useValue: currenciesService },
        { provide: CurrencyPairService, useValue: currencyPairService },
        { provide: ExchangeRatesService, useValue: exchangeRatesService },
        { provide: StellarService, useValue: stellarService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
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
        { provide: LedgerService, useValue: ledgerService },
        { provide: TransactionLimitService, useValue: transactionLimitService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AmlService, useValue: { enqueue: jest.fn(async () => undefined) } },
        {
          provide: MicroSavingsService,
          useValue: {
            evaluatePerTransaction: jest.fn(async () => undefined),
            evaluateBalanceThreshold: jest.fn(async () => undefined),
          },
        },
        {
          provide: UnifiedActivityFeedService,
          useValue: { append: jest.fn(async () => undefined) },
        },
        { provide: getQueueToken(TAX_QUEUE), useValue: { add: jest.fn(async () => undefined) } },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      expect.anything(),
    );
  });

  it('creates pending deposit instructions without sending a payment', async () => {
    const transaction = await service.createDeposit('user-1', {
      amount: 100,
      currency: 'XLM',
      sourceAddress: 'G_UNTRUSTED_CLIENT_ADDRESS',
    });

    expect(transaction.status).toBe(TransactionStatus.PENDING);
    expect(transaction.txHash).toBeUndefined();
    expect(transaction.depositAddress).toBe(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    );
    expect(transaction.depositMemo).toMatch(/^[a-f0-9]{28}$/);
    expect(stellarService.sendPayment).not.toHaveBeenCalled();
    expect(stellarService.createTransaction).not.toHaveBeenCalled();
  });

  it('returns BadRequestException when the deposit currency is unknown', async () => {
    currenciesService.getCurrency.mockRejectedValueOnce(
      new NotFoundException("Currency with code 'ZZZ' not found"),
    );

    await expect(
      service.createDeposit('user-1', {
        amount: 100,
        currency: 'ZZZ',
        sourceAddress: 'G_SOURCE_ADDRESS',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(transactionRepository.create).not.toHaveBeenCalled();
    expect(stellarService.sendPayment).not.toHaveBeenCalled();
  });

  it('returns BadRequestException when the deposit currency is inactive', async () => {
    currenciesService.getCurrency.mockResolvedValueOnce({
      isActive: false,
      code: 'XLM',
    });

    await expect(
      service.createDeposit('user-1', {
        amount: 100,
        currency: 'XLM',
        sourceAddress: 'G_SOURCE_ADDRESS',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(transactionRepository.create).not.toHaveBeenCalled();
  });

  it('returns BadRequestException when the withdrawal currency is unknown', async () => {
    currenciesService.getCurrency.mockRejectedValueOnce(
      new NotFoundException("Currency with code 'ZZZ' not found"),
    );

    await expect(
      service.createWithdrawal('user-1', {
        amount: 100,
        currency: 'ZZZ',
        destinationAddress:
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(transactionRepository.create).not.toHaveBeenCalled();
  });

  it('leaves a deposit pending until a matching inbound payment is found', async () => {
    const transaction = {
      id: 'tx-pending-deposit',
      userId: 'user-1',
      type: TransactionType.DEPOSIT,
      amount: '100.00000000',
      currency: 'XLM',
      status: TransactionStatus.PENDING,
      txHash: null,
      createdAt: new Date(),
      metadata: {
        depositAddress:
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        depositMemo: '0123456789abcdef0123456789ab',
      },
    } as Transaction;
    transactionRepository.findOne.mockResolvedValueOnce(transaction);

    const result = await service.verifyTransaction(transaction.id);

    expect(result.status).toBe(TransactionStatus.PENDING);
    expect(stellarService.findIncomingPayment).toHaveBeenCalledWith({
      address: transaction.metadata.depositAddress,
      amount: transaction.amount,
      currency: transaction.currency,
      memo: transaction.metadata.depositMemo,
      createdAfter: transaction.createdAt,
    });
    expect(stellarService.verifyTransaction).not.toHaveBeenCalled();
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
      expect.anything(),
    );
  });

  it('withdraws native XLM using Asset.native() for the payment', async () => {
    const nativeAsset = Asset.native();
    stellarService.getAssetWithDefaultIssuer.mockReturnValueOnce(nativeAsset);
    const paymentSpy = jest.spyOn(Operation, 'payment');

    await service.createWithdrawal('user-1', {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(paymentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        asset: nativeAsset,
        amount: '100',
      }),
    );
    expect(stellarService.sendPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: nativeAsset,
        amount: '100',
        secretKey: expect.any(String),
      }),
    );
  });

  it('withdraws an issued asset using its configured issuer', async () => {
    const issuer =
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335XPB7X3NCQXMK3SBEG3CIFE7G';
    const issuedAsset = new Asset('USDC', issuer);
    currenciesService.getCurrency.mockResolvedValueOnce({
      isActive: true,
      code: 'USDC',
      issuer,
    });
    stellarService.getAssetWithDefaultIssuer.mockReturnValueOnce(issuedAsset);
    const paymentSpy = jest.spyOn(Operation, 'payment');

    await service.createWithdrawal('user-1', {
      amount: 100,
      currency: 'USDC',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(paymentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: issuedAsset,
        amount: '100',
      }),
    );
    expect(stellarService.sendPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: issuedAsset,
        amount: '100',
      }),
    );
  });

  it('persists the Stellar hash on the withdrawal row immediately after submission', async () => {
    await service.createWithdrawal('user-1', {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(transactionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: 'stellar-hash',
        stellarTxHash: 'stellar-hash',
      }),
    );
  });

  it('debits the withdrawal amount and same-currency fee in one balance update', async () => {
    const updateBalance = jest.spyOn(
      service as unknown as { updateUserBalance: jest.Mock },
      'updateUserBalance',
    );

    await service.createWithdrawal('user-1', {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(updateBalance).toHaveBeenCalledWith('user-1', 'XLM', -101.25);
    expect(ledgerService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        feeAmount: '1.25000000',
        feeCurrency: 'XLM',
      }),
      expect.anything(),
    );
  });

  it('debits a different fee currency separately from the withdrawal amount', async () => {
    feesService.calculateFee.mockResolvedValueOnce({
      feeAmount: 1.25,
      feeCurrency: 'USDC',
      feeType: FeeType.FLAT,
    });
    const updateBalance = jest
      .spyOn(service as unknown as { updateUserBalance: jest.Mock }, 'updateUserBalance')
      .mockResolvedValue(undefined);

    await service.createWithdrawal('user-1', {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(updateBalance).toHaveBeenCalledWith('user-1', 'XLM', -100);
    expect(updateBalance).toHaveBeenCalledWith('user-1', 'USDC', -1.25);
  });

  it('throws BadRequestException when neither destinationAddress nor beneficiaryId is provided', async () => {
    await expect(
      service.createWithdrawal('user-1', {
        amount: 100,
        currency: 'XLM',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createWithdrawal('user-1', {
        amount: 100,
        currency: 'XLM',
      }),
    ).rejects.toThrow(
      'Either destinationAddress or a valid beneficiaryId must be provided.',
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
      expect.anything(),
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
      });

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
      });

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

  it('falls back to the currency issuer when Stellar config has none', async () => {
    const issuer =
      'GDSBCQO34HWPGUGQSP3QBFEXVTSR2PW46UIGTHVWGWJGQKH3AFNHXHXN';
    stellarService.getAssetWithDefaultIssuer.mockImplementationOnce(() => {
      throw new Error('No Stellar issuer configured for USDC on TESTNET');
    });
    currenciesService.getCurrency.mockResolvedValueOnce({
      code: 'USDC',
      issuer,
    } as any);

    const asset = await (service as any).getAssetHelper('USDC');

    expect(stellarService.getAsset).toHaveBeenCalledWith('USDC', issuer);
    expect(asset).toEqual({ code: 'USDC' });
  });
});
