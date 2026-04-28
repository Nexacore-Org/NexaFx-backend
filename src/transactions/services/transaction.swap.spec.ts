import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TransactionsService } from './transaction.service';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../entities/transaction.entity';
import { CurrenciesService } from '../../currencies/currencies.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { StellarService } from '../../blockchain/stellar/stellar.service';
import { UsersService } from '../../users/users.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ReferralsService } from '../../referrals/referrals.service';
import { FeesService } from '../../fees/fees.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { FeeType } from '../../fees/entities/fee-config.entity';
import { Asset, Operation } from 'stellar-sdk';
import { CurrencyPairService } from '../../currencies/services/currency-pair.service';
import { WalletsService } from '../../wallets/wallets.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { FirebaseService } from '../../firebase/firebase.service';
import { WebhookService } from '../../webhooks/services/webhook.service';
import { BeneficiariesService } from '../../beneficiaries/beneficiaries.service';
import { LedgerService } from '../../ledger/services/ledger.service';

// Mock Stellar SDK components
jest.mock('stellar-sdk', () => {
  const original = jest.requireActual('stellar-sdk');
  return {
    ...original,
    Asset: {
      native: jest.fn(() => ({ isNative: () => true })),
    },
    Operation: {
      pathPaymentStrictSend: jest.fn(() => ({})),
    },
  };
});

// Re-cast Asset for constructor mock
const MockAsset = Asset as unknown as jest.Mock;
// @ts-ignore
Asset.constructor = jest.fn(() => ({ isNative: () => false }));
// For non-native assets
(Asset as any) = jest.fn(() => ({ isNative: () => false }));
(Asset as any).native = jest.fn(() => ({ isNative: () => true }));

describe('TransactionsService.createSwap', () => {
  let service: TransactionsService;
  let transactionRepository: any;
  let stellarService: any;
  let notificationsService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    transactionRepository = {
      create: jest.fn((payload) => ({ id: 'tx-123', ...payload })),
      save: jest.fn(async (payload) => ({ ...payload })),
    };

    stellarService = {
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
      getAsset: jest.fn(() => ({ isNative: () => true })),
    };

    notificationsService = {
      create: jest.fn(async () => ({})),
    };
    const ledgerService = {
      record: jest.fn(async () => undefined),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepository,
        },
        { provide: DataSource, useValue: dataSource },
        {
          provide: CurrenciesService,
          useValue: {
            findOne: jest.fn(async () => ({ isActive: true })),
          },
        },
        {
          provide: ExchangeRatesService,
          useValue: {
            getRate: jest.fn(async () => ({ rate: 0.5 })),
          },
        },
        { provide: StellarService, useValue: stellarService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: FeesService,
          useValue: {
            calculateFee: jest.fn(async () => ({
              feeAmount: 1,
              feeCurrency: 'XLM',
              feeType: FeeType.FLAT,
            })),
            recordFee: jest.fn(async () => ({})),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(async () => ({
              id: 'user-1',
              walletPublicKey: 'G123',
              walletSecretKeyEncrypted: 'S123',
              balances: { XLM: 100 },
            })),
            updateByUserId: jest.fn(async () => ({})),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logTransactionEvent: jest.fn(async () => ({})),
          },
        },
        {
          provide: ReferralsService,
          useValue: {
            processReferralReward: jest.fn(async () => ({})),
          },
        },
        { provide: NotificationsService, useValue: notificationsService },
        {
          provide: CurrencyPairService,
          useValue: {
            validatePair: jest.fn(async () => ({ spreadPercent: 0.5 })),
            findByCodes: jest.fn(async () => ({ spreadPercent: 0.5 })),
          },
        },
        {
          provide: WalletsService,
          useValue: {
            resolveWalletForTransaction: jest.fn(async () => ({
              publicKey: 'G123',
              encryptedSecretKey: 'enc',
            })),
          },
        },
        {
          provide: EncryptionService,
          useValue: { decrypt: jest.fn(() => 'S123') },
        },
        { provide: FirebaseService, useValue: {} },
        {
          provide: WebhookService,
          useValue: { dispatch: jest.fn(() => Promise.resolve()) },
        },
        { provide: BeneficiariesService, useValue: {} },
        { provide: LedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    // Mock private methods
    (service as any).getUserBalance = jest.fn(async () => '100');
    (service as any).getUserStellarAddress = jest.fn(async () => 'G123');
    (service as any).getUserStellarSecretKey = jest.fn(async () => 'S123');
    (service as any).updateUserBalance = jest.fn(async () => {});
  });

  it('should successfully create a swap transaction', async () => {
    const dto = {
      amount: 10,
      fromCurrency: 'XLM',
      toCurrency: 'USDC',
      sourceAddress: 'G123',
    };

    const result = await service.createSwap('user-1', dto);

    expect(result.type).toBe(TransactionType.SWAP);
    expect(result.status).toBe(TransactionStatus.SUCCESS);
    expect(result.txHash).toBe('stellar-hash');
    expect(result.amount).toBe('10');
    expect(result.toCurrency).toBe('USDC');
    expect(result.toAmount).toBe('99.50000000');

    expect(stellarService.submitTransaction).toHaveBeenCalled();
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.SWAP_COMPLETED,
      }),
    );
  });

  it('should throw BadRequestException if currencies are the same', async () => {
    const dto = {
      amount: 10,
      fromCurrency: 'XLM',
      toCurrency: 'XLM',
      sourceAddress: 'G_SOURCE',
    };

    await expect(service.createSwap('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should fail transaction if Stellar submission fails', async () => {
    stellarService.submitTransaction.mockRejectedValueOnce(
      new Error('Stellar error'),
    );

    const dto = {
      amount: 10,
      fromCurrency: 'XLM',
      toCurrency: 'USDC',
      sourceAddress: 'G123',
    };

    await expect(service.createSwap('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: TransactionStatus.FAILED,
        failureReason: 'Stellar error',
      }),
    );
  });
});
