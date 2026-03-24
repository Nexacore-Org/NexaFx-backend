import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionsService } from './transaction.service';
import { Transaction } from '../entities/transaction.entity';
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
    get: jest.fn(() => 'S_TEST_HOT_WALLET_SECRET'),
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
        { provide: ExchangeRatesService, useValue: exchangeRatesService },
        { provide: StellarService, useValue: stellarService },
        { provide: ConfigService, useValue: configService },
        { provide: FeesService, useValue: feesService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ReferralsService, useValue: referralsService },
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
});
