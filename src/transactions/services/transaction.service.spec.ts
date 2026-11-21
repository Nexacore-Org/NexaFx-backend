import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { IsNull } from 'typeorm';
import { BalanceService } from '../../balances/balance.service';
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
    accountExists: jest.fn(async () => true),
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
    reverse: jest.fn(async () => undefined),
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
      update: jest.fn(async () => ({ affected: 1 })),
    },
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const amlService = { enqueue: jest.fn(async () => undefined) };
  const taxQueue = { add: jest.fn(async () => undefined) };

  const balanceService = {
    getBalance: jest.fn(async () => '1000'),
    debit: jest.fn(async () => '900'),
    credit: jest.fn(async () => '1100'),
    applyDelta: jest.fn(async () => '1100'),
  };

  /** Exact-decimal money matcher: balances move as Decimal values. */
  const money = (expected: string) => ({
    asymmetricMatch: (actual: unknown) =>
      actual !== null &&
      actual !== undefined &&
      new Decimal(String(actual)).eq(new Decimal(expected)),
    toAsymmetricMatcher: () => `Money(${expected})`,
  });

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
        { provide: AmlService, useValue: amlService },
        { provide: BalanceService, useValue: balanceService },
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
        { provide: getQueueToken(TAX_QUEUE), useValue: taxQueue },
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

  describe('destination account validation (#1456)', () => {
    const dto = {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('rejects a withdrawal to an unfunded account with 400 before any write', async () => {
      stellarService.accountExists.mockResolvedValueOnce(false);

      await expect(service.createWithdrawal('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        (async () => {
          stellarService.accountExists.mockResolvedValueOnce(false);
          await service.createWithdrawal('user-1', dto);
        })(),
      ).rejects.toThrow('Destination account is not activated');

      expect(stellarService.accountExists).toHaveBeenCalledWith(
        dto.destinationAddress,
      );
      // No balance reserved, no row persisted, no ledger entry, nothing sent.
      expect(balanceService.debit).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
      expect(transactionRepository.save).not.toHaveBeenCalled();
      expect(queryRunner.manager.save).not.toHaveBeenCalled();
      expect(ledgerService.record).not.toHaveBeenCalled();
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
    });

    it('proceeds when the destination account exists', async () => {
      stellarService.accountExists.mockResolvedValueOnce(true);

      await service.createWithdrawal('user-1', dto);

      expect(stellarService.sendPayment).toHaveBeenCalledTimes(1);
    });

    it('proceeds when the check times out', async () => {
      jest.useFakeTimers();
      stellarService.accountExists.mockReturnValueOnce(
        new Promise<boolean>(() => undefined),
      );

      const pending = service.createWithdrawal('user-1', dto);
      await jest.advanceTimersByTimeAsync(5_000);
      await pending;

      expect(stellarService.sendPayment).toHaveBeenCalledTimes(1);
    });

    it('proceeds on a transient error instead of blocking a valid withdrawal', async () => {
      stellarService.accountExists.mockRejectedValueOnce(
        new Error('Horizon unavailable'),
      );

      await service.createWithdrawal('user-1', dto);

      expect(stellarService.sendPayment).toHaveBeenCalledTimes(1);
    });

    it('does not treat an unrelated error mentioning "not found" as an unfunded account', async () => {
      // The old check sniffed error text. Only an authoritative false from
      // accountExists may reject.
      stellarService.accountExists.mockRejectedValueOnce(
        new Error('route not found 404 does not exist'),
      );

      await service.createWithdrawal('user-1', dto);

      expect(stellarService.sendPayment).toHaveBeenCalledTimes(1);
    });
  });

  describe('withdrawal balance reservation', () => {
    const dto = {
      amount: 100,
      currency: 'XLM',
      destinationAddress:
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    };

    it('reserves the amount and same-currency fee in one atomic debit BEFORE sending', async () => {
      const order: string[] = [];
      balanceService.debit.mockImplementationOnce(async () => {
        order.push('debit');
        return '898.75';
      });
      stellarService.sendPayment.mockImplementationOnce(async () => {
        order.push('send');
        return { hash: 'stellar-hash' };
      });

      await service.createWithdrawal('user-1', dto);

      expect(order).toEqual(['debit', 'send']);
      expect(balanceService.debit).toHaveBeenCalledTimes(1);
      expect(balanceService.debit).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('101.25'),
        queryRunner.manager,
      );
      expect(balanceService.credit).not.toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(ledgerService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          feeAmount: '1.25000000',
          feeCurrency: 'XLM',
        }),
        expect.anything(),
      );
    });

    it('reserves a different fee currency separately, in the same database transaction', async () => {
      feesService.calculateFee.mockResolvedValueOnce({
        feeAmount: 1.25,
        feeCurrency: 'USDC',
        feeType: FeeType.FLAT,
      });

      await service.createWithdrawal('user-1', dto);

      expect(balanceService.debit).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('100'),
        queryRunner.manager,
      );
      expect(balanceService.debit).toHaveBeenCalledWith(
        'user-1',
        'USDC',
        money('1.25'),
        queryRunner.manager,
      );
      // Both debits ran on the same transactional manager, so they commit
      // or roll back together.
      expect(
        balanceService.debit.mock.calls.every(
          (call: unknown[]) => call[3] === queryRunner.manager,
        ),
      ).toBe(true);
    });

    it('fails with 400 and sends nothing when the atomic debit loses the race', async () => {
      balanceService.debit.mockRejectedValueOnce(
        new BadRequestException('Insufficient balance'),
      );

      await expect(service.createWithdrawal('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(stellarService.sendPayment).not.toHaveBeenCalled();
      expect(transactionRepository.create).not.toHaveBeenCalled();
      expect(balanceService.credit).not.toHaveBeenCalled();
    });

    it('refunds the reservation when the send fails before submission', async () => {
      stellarService.sendPayment.mockRejectedValueOnce(
        new Error('horizon down'),
      );

      await expect(service.createWithdrawal('user-1', dto)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(balanceService.debit).toHaveBeenCalledTimes(1);
      expect(balanceService.credit).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('101.25'),
        queryRunner.manager,
      );
    });
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

      const result = await service.cancelTransaction(
        'tx-cancel-test',
        'user-1',
      );

      expect(result.status).toBe(TransactionStatus.CANCELLED);
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'tx-cancel-test' },
      });
      // The claim, the ledger reversal and the commit are one transaction.
      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'tx-cancel-test',
          status: TransactionStatus.PENDING,
        }),
        expect.objectContaining({ status: TransactionStatus.CANCELLED }),
      );
      expect(ledgerService.reverse).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-cancel-test' }),
        queryRunner,
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
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

    it('should return 409 when cancelling a non-PENDING transaction', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makePending({ status: TransactionStatus.SUCCESS }),
      );

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(
        'Cannot cancel transaction with status SUCCESS. Only PENDING transactions can be cancelled.',
      );

      expect(queryRunner.manager.update).not.toHaveBeenCalled();
      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.cancelTransaction('tx-nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('rejects cancelling a transaction already submitted to Stellar', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makePending({ txHash: 'stellar-hash-123' }),
      );

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(ConflictException);

      expect(queryRunner.manager.update).not.toHaveBeenCalled();
      expect(ledgerService.reverse).not.toHaveBeenCalled();
      expect(balanceService.applyDelta).not.toHaveBeenCalled();
      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('makes the claim itself refuse a transaction submitted after the read', async () => {
      transactionRepository.findOne.mockResolvedValue(makePending());
      queryRunner.manager.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(ConflictException);

      const criteria = (
        queryRunner.manager.update.mock.calls[0] as unknown[]
      )[1] as Record<string, unknown>;
      expect(criteria.txHash).toEqual(IsNull());
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(balanceService.applyDelta).not.toHaveBeenCalled();
      expect(ledgerService.reverse).not.toHaveBeenCalled();
    });

    it('restores the reserved balance when a stale withdrawal is cancelled', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makePending({
          type: TransactionType.WITHDRAW,
          feeAmount: '1.25',
          feeCurrency: 'XLM',
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        }),
      );

      await service.cancelTransaction('tx-cancel-test', 'user-1');

      expect(balanceService.applyDelta).toHaveBeenCalledTimes(1);
      expect(balanceService.applyDelta).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('101.25'),
        queryRunner.manager,
      );
    });

    it('refuses to cancel a withdrawal that may still be inside its request', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makePending({
          type: TransactionType.WITHDRAW,
          createdAt: new Date(),
        }),
      );

      await expect(
        service.cancelTransaction('tx-cancel-test', 'user-1'),
      ).rejects.toThrow(ConflictException);

      expect(queryRunner.startTransaction).not.toHaveBeenCalled();
      expect(balanceService.applyDelta).not.toHaveBeenCalled();
    });
  });

  describe('status state machine (#1455)', () => {
    const OLD = new Date(Date.now() - 60 * 60 * 1000);
    const makeTx = (overrides: Record<string, unknown> = {}): Transaction =>
      ({
        id: 'tx-1',
        userId: 'user-1',
        status: TransactionStatus.PENDING,
        type: TransactionType.DEPOSIT,
        amount: '100',
        currency: 'XLM',
        feeAmount: '1.25',
        feeCurrency: 'XLM',
        txHash: null,
        createdAt: OLD,
        ...overrides,
      }) as unknown as Transaction;

    const update = (to: TransactionStatus) =>
      service.updateTransactionStatus('tx-1', to, 'admin-1', 'because');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    const S = TransactionStatus;
    it.each([
      [S.SUCCESS, S.PENDING],
      [S.SUCCESS, S.FAILED],
      [S.SUCCESS, S.CANCELLED],
      [S.FAILED, S.SUCCESS],
      [S.FAILED, S.PENDING],
      [S.FAILED, S.CANCELLED],
      [S.CANCELLED, S.SUCCESS],
      [S.CANCELLED, S.FAILED],
      [S.CANCELLED, S.PENDING],
      [S.PENDING, S.PENDING],
    ])('rejects %s to %s with 409 and changes nothing', async (from, to) => {
      transactionRepository.findOne.mockResolvedValue(makeTx({ status: from }));

      await expect(update(to)).rejects.toThrow(ConflictException);

      expect(queryRunner.manager.update).not.toHaveBeenCalled();
      expect(balanceService.applyDelta).not.toHaveBeenCalled();
      expect(ledgerService.reverse).not.toHaveBeenCalled();
      expect(taxQueue.add).not.toHaveBeenCalled();
      expect(amlService.enqueue).not.toHaveBeenCalled();
      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown transaction', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(update(S.SUCCESS)).rejects.toThrow(NotFoundException);
    });

    it('PENDING to SUCCESS on a deposit credits net of fee, once, in the same transaction', async () => {
      transactionRepository.findOne.mockResolvedValue(makeTx());

      const result = await update(S.SUCCESS);

      expect(result.status).toBe(S.SUCCESS);
      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'tx-1', status: S.PENDING }),
        expect.objectContaining({
          status: S.SUCCESS,
          failureReason: 'because',
        }),
      );
      expect(balanceService.applyDelta).toHaveBeenCalledTimes(1);
      expect(balanceService.applyDelta).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('98.75'),
        queryRunner.manager,
      );
      expect(ledgerService.reverse).not.toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(taxQueue.add).toHaveBeenCalled();
      expect(amlService.enqueue).toHaveBeenCalledWith('tx-1');
    });

    it('PENDING to FAILED on a withdrawal refunds amount + fee and reverses the ledger', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTx({ type: TransactionType.WITHDRAW }),
      );

      await update(S.FAILED);

      expect(balanceService.applyDelta).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('101.25'),
        queryRunner.manager,
      );
      expect(ledgerService.reverse).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-1' }),
        queryRunner,
      );
      expect(taxQueue.add).not.toHaveBeenCalled();
      expect(amlService.enqueue).not.toHaveBeenCalled();
    });

    it('refunds a fee in a different currency separately', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTx({ type: TransactionType.WITHDRAW, feeCurrency: 'USDC' }),
      );

      await update(S.CANCELLED);

      expect(balanceService.applyDelta).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('100'),
        queryRunner.manager,
      );
      expect(balanceService.applyDelta).toHaveBeenCalledWith(
        'user-1',
        'USDC',
        money('1.25'),
        queryRunner.manager,
      );
    });

    it('PENDING to CANCELLED on a stale swap gives back the reserved amount + fee', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTx({ type: TransactionType.SWAP, currency: 'XLM' }),
      );

      await update(S.CANCELLED);

      expect(balanceService.applyDelta).toHaveBeenCalledTimes(1);
      expect(balanceService.applyDelta).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        money('101.25'),
        queryRunner.manager,
      );
    });

    it('moves no money when a deposit fails, but still reverses the ledger', async () => {
      transactionRepository.findOne.mockResolvedValue(makeTx());

      await update(S.FAILED);

      expect(balanceService.applyDelta).not.toHaveBeenCalled();
      expect(ledgerService.reverse).toHaveBeenCalledTimes(1);
    });

    it('applies nothing and fires no side effects when it loses the race for the claim', async () => {
      transactionRepository.findOne.mockResolvedValue(makeTx());
      queryRunner.manager.update.mockResolvedValueOnce({ affected: 0 });

      await expect(update(S.SUCCESS)).rejects.toThrow(ConflictException);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(balanceService.applyDelta).not.toHaveBeenCalled();
      expect(ledgerService.reverse).not.toHaveBeenCalled();
      expect(taxQueue.add).not.toHaveBeenCalled();
      expect(amlService.enqueue).not.toHaveBeenCalled();
      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('rolls the whole transition back when the balance effect fails', async () => {
      transactionRepository.findOne.mockResolvedValue(makeTx());
      balanceService.applyDelta.mockRejectedValueOnce(
        new BadRequestException('Insufficient balance'),
      );

      await expect(update(S.SUCCESS)).rejects.toThrow('Insufficient balance');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
      expect(taxQueue.add).not.toHaveBeenCalled();
      expect(auditLogsService.logTransactionEvent).not.toHaveBeenCalled();
    });

    it('rolls back when the ledger reversal fails', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTx({ type: TransactionType.WITHDRAW }),
      );
      ledgerService.reverse.mockRejectedValueOnce(new Error('ledger down'));

      await expect(update(S.FAILED)).rejects.toThrow('ledger down');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('does not settle a withdrawal that may still be inside its request', async () => {
      transactionRepository.findOne.mockResolvedValue(
        makeTx({ type: TransactionType.WITHDRAW, createdAt: new Date() }),
      );

      await expect(update(S.FAILED)).rejects.toThrow(ConflictException);

      expect(queryRunner.startTransaction).not.toHaveBeenCalled();
      expect(balanceService.applyDelta).not.toHaveBeenCalled();
    });

    it('allows a young withdrawal that already has a hash, and a young deposit', async () => {
      transactionRepository.findOne.mockResolvedValueOnce(
        makeTx({
          type: TransactionType.WITHDRAW,
          createdAt: new Date(),
          txHash: 'abc',
        }),
      );
      await expect(update(S.FAILED)).resolves.toBeDefined();

      transactionRepository.findOne.mockResolvedValueOnce(
        makeTx({ createdAt: new Date() }),
      );
      await expect(update(S.SUCCESS)).resolves.toBeDefined();
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
