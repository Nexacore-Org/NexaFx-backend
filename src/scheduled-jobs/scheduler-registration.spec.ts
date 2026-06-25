jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { TransactionVerificationService } from '../transactions/services/transaction-verification.service';
import { TransactionsService } from '../transactions/services/transaction.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { DataRequest } from '../users/entities/data-request.entity';
import { IdempotencyRecord } from '../common/entities/idempotency-record.entity';
import { UsersService } from '../users/users.service';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { CurrencyPairService } from '../currencies/services/currency-pair.service';
import { ProposalService } from '../dao/services/proposal.service';
import { LedgerVerificationService } from '../ledger/services/ledger-verification.service';

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

  const serviceMock = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        ScheduledJobsService,
        TransactionVerificationService,
        { provide: TransactionsService, useValue: serviceMock },
        {
          provide: UsersService,
          useValue: {
            syncWalletBalanceSnapshots: jest
              .fn()
              .mockResolvedValue({ processed: 0, updated: 0, failed: 0 }),
          },
        },
        {
          provide: RateAlertsService,
          useValue: {
            checkAndTriggerAlerts: jest
              .fn()
              .mockResolvedValue({ checked: 0, triggered: 0, reactivated: 0 }),
          },
        },
        { provide: NotificationsService, useValue: serviceMock },
        {
          provide: StellarService,
          useValue: {
            verifyTransaction: jest.fn(),
            getWalletBalances: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logEvent: jest.fn(),
            createLog: jest.fn(),
            logTransactionEvent: jest.fn(),
          },
        },
        { provide: WebhookService, useValue: { dispatch: jest.fn() } },
        { provide: CurrencyPairService, useValue: serviceMock },
        {
          provide: ProposalService,
          useValue: {
            getExpiredActiveProposals: jest.fn().mockResolvedValue([]),
            finalizeProposal: jest.fn(),
          },
        },
        {
          provide: LedgerVerificationService,
          useValue: {
            verify: jest
              .fn()
              .mockResolvedValue({ status: 'BALANCED', discrepancies: [] }),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(() => ({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: { save: jest.fn() },
            })),
          },
        },
        { provide: getRepositoryToken(Transaction), useValue: repositoryMock },
        { provide: getRepositoryToken(Notification), useValue: repositoryMock },
        { provide: getRepositoryToken(DataRequest), useValue: repositoryMock },
        {
          provide: getRepositoryToken(IdempotencyRecord),
          useValue: {
            ...repositoryMock,
            createQueryBuilder: jest.fn(() => ({
              delete: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 0 }),
            })),
          },
        },
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
    expect(registry.getCronJobs().size).toBe(14);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Cannot register cron job'),
    );

    warnSpy.mockRestore();
  });
});
