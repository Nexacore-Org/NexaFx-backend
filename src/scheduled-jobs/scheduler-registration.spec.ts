jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { TransactionVerificationService } from '../transactions/services/transaction-verification.service';
import { TransactionsService } from '../transactions/services/transaction.service';
import { UsersService } from '../users/users.service';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { ExchangeRatesProviderClient } from '../exchange-rates/providers/exchange-rates.provider';
import { ExchangeRatesCache } from '../exchange-rates/cache/exchange-rates.cache';
import { CurrenciesService } from '../currencies/currencies.service';
import { FeesService } from '../fees/fees.service';
import { ReferralsService } from '../referrals/referrals.service';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { FirebaseService } from '../firebase/firebase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditLogsRepository } from '../audit-logs/audit-logs.repository';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { User } from '../users/user.entity';
import { RateAlert } from '../rate-alerts/entities/rate-alert.entity';
import { Currency } from '../currencies/currency.entity';
import { FeeConfig } from '../fees/entities/fee-config.entity';
import { FeeRecord } from '../fees/entities/fee-record.entity';
import { Referral } from '../referrals/entities/referral.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';

type ProviderWrapper = {
  name: string;
  isDependencyTreeStatic: () => boolean;
};

type ModuleEntry = {
  providers: Map<unknown, ProviderWrapper>;
};

type ContainerLike = {
  getModules: () => Map<unknown, ModuleEntry>;
};

describe('Scheduler registration', () => {
  let moduleRef: TestingModule;

  const repositoryMock = {
    find: jest.fn(),
    findOne: jest.fn(),
    countBy: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        EXCHANGE_RATES_PROVIDER_BASE_URL: 'https://api.exchangerate.host',
        EXCHANGE_RATES_PROVIDER_TIMEOUT_MS: '5000',
        EXCHANGE_RATES_CACHE_TTL_SECONDS: '600',
        EXCHANGE_RATES_CACHE_MAX_SIZE: '1000',
        REFERRAL_REWARD_AMOUNT: '0',
        REFERRAL_REWARD_CURRENCY: 'USD',
        JWT_SECRET: 'test-secret',
        NODE_ENV: 'test',
        JWT_EXPIRES_IN: '15m',
      };

      return values[key];
    }),
  };

  const httpServiceMock = {
    get: jest.fn(),
  };

  const auditLogsRepositoryMock = {
    createAuditLog: jest.fn(),
    findLogsWithPagination: jest.fn(),
  };

  const firebaseServiceMock = {
    sendToTokens: jest.fn(),
  };

  const stellarServiceMock = {
    verifyTransaction: jest.fn(),
    getWalletBalances: jest.fn(),
    createTransaction: jest.fn(),
    signTransaction: jest.fn(),
    submitTransaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        ScheduledJobsService,
        TransactionVerificationService,
        TransactionsService,
        UsersService,
        RateAlertsService,
        NotificationsService,
        ExchangeRatesService,
        ExchangeRatesProviderClient,
        ExchangeRatesCache,
        CurrenciesService,
        FeesService,
        ReferralsService,
        BeneficiariesService,
        AuditLogsService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: HttpService, useValue: httpServiceMock },
        { provide: AuditLogsRepository, useValue: auditLogsRepositoryMock },
        { provide: FirebaseService, useValue: firebaseServiceMock },
        { provide: StellarService, useValue: stellarServiceMock },
        { provide: getRepositoryToken(Transaction), useValue: repositoryMock },
        { provide: getRepositoryToken(Notification), useValue: repositoryMock },
        { provide: getRepositoryToken(User), useValue: repositoryMock },
        { provide: getRepositoryToken(RateAlert), useValue: repositoryMock },
        { provide: getRepositoryToken(Currency), useValue: repositoryMock },
        { provide: getRepositoryToken(FeeConfig), useValue: repositoryMock },
        { provide: getRepositoryToken(FeeRecord), useValue: repositoryMock },
        { provide: getRepositoryToken(Referral), useValue: repositoryMock },
        { provide: getRepositoryToken(Beneficiary), useValue: repositoryMock },
      ],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('keeps both cron providers in a static dependency tree', () => {
    const container = (moduleRef as unknown as { container: ContainerLike })
      .container;
    const providers = Array.from(container.getModules().values()).flatMap(
      (moduleEntry) => Array.from(moduleEntry.providers.values()),
    );

    const scheduledJobsWrapper = providers.find(
      (wrapper) => wrapper.name === ScheduledJobsService.name,
    );
    const transactionVerificationWrapper = providers.find(
      (wrapper) => wrapper.name === TransactionVerificationService.name,
    );

    expect(scheduledJobsWrapper?.isDependencyTreeStatic()).toBe(true);
    expect(transactionVerificationWrapper?.isDependencyTreeStatic()).toBe(true);
  });

  it('registers cron jobs without scheduler non-static-provider warnings', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await moduleRef.init();

    const registry = moduleRef.get(SchedulerRegistry);
    expect(registry.getCronJobs().size).toBe(7);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Cannot register cron job'),
    );

    warnSpy.mockRestore();
  });
});
