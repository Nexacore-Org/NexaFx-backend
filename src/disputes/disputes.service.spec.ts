import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DisputesService } from './disputes.service';
import {
  Dispute,
  DisputeStatus,
  DisputeReason,
} from './entities/dispute.entity';
import {
  DisputeEvidence,
  EvidenceSide,
} from './entities/dispute-evidence.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService } from '../ledger/services/ledger.service';
import { UsersService } from '../users/users.service';
import { DisputeOutcome } from './dto/resolve-dispute.dto';

// ─── Shared test fixtures ────────────────────────────────────────────────────

const CLAIMANT_ID = 'user-claimant-1';
const RESPONDENT_ID = 'user-respondent-2';
const ADMIN_ID = 'user-admin-3';
const TX_ID = 'tx-abc-123';
const DISPUTE_ID = 'dispute-xyz-999';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const base = new Transaction();
  base.id = TX_ID;
  base.userId = RESPONDENT_ID;
  base.type = TransactionType.DEPOSIT;
  base.amount = '100.00000000';
  base.currency = 'XLM';
  base.status = TransactionStatus.SUCCESS;
  base.createdAt = new Date();
  base.updatedAt = new Date();
  return Object.assign(base, overrides);
}

function makeDispute(overrides: Partial<Dispute> = {}): Dispute {
  const base = new Dispute();
  base.id = DISPUTE_ID;
  base.transactionId = TX_ID;
  base.raisedById = CLAIMANT_ID;
  base.reason = DisputeReason.UNAUTHORIZED;
  base.description = 'I did not authorise this transaction';
  base.status = DisputeStatus.OPEN;
  base.disputeWindowExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 29);
  base.createdAt = new Date();
  base.resolvedAt = null;
  base.resolution = null;
  base.assignedAdminId = null;
  base.evidence = [];
  return Object.assign(base, overrides);
}

// ─── Mock factories ──────────────────────────────────────────────────────────

function makeDisputeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    create: jest.fn((d) => d),
    save: jest.fn(async (d) => ({ ...d, id: d.id ?? DISPUTE_ID })),
    findOne: jest.fn(),
    findAndCount: jest.fn(async () => [[], 0]),
    update: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeEvidenceRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => ({ ...e, id: 'evidence-1' })),
    update: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeTransactionRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(async () => makeTransaction()),
    ...overrides,
  };
}

function makeNotificationsService() {
  return { create: jest.fn(async () => undefined) };
}

function makeLedgerService() {
  return { record: jest.fn(async () => []) };
}

function makeUsersService(balances: Record<string, number> = { XLM: 500 }) {
  return {
    findById: jest.fn(async (id: string) => ({
      id,
      balances,
      fcmTokens: [],
    })),
    updateByUserId: jest.fn(async () => undefined),
  };
}

// QueryRunner mock used in chargeback tests
function makeQueryRunner(saveResult?: object) {
  const qr = {
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    manager: {
      create: jest.fn((_, data) => data),
      save: jest.fn(async (_, data) => ({ id: 'new-id', ...data })),
    },
  };
  return qr;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('DisputesService', () => {
  let service: DisputesService;
  let disputeRepo: ReturnType<typeof makeDisputeRepo>;
  let evidenceRepo: ReturnType<typeof makeEvidenceRepo>;
  let transactionRepo: ReturnType<typeof makeTransactionRepo>;
  let notificationsService: ReturnType<typeof makeNotificationsService>;
  let usersService: ReturnType<typeof makeUsersService>;
  let dataSource: { createQueryRunner: jest.Mock };

  async function buildService(
    disputeRepoOverrides: Record<string, jest.Mock> = {},
    transactionRepoOverrides: Record<string, jest.Mock> = {},
    usersBalances: Record<string, number> = { XLM: 500 },
  ) {
    disputeRepo = makeDisputeRepo(disputeRepoOverrides);
    evidenceRepo = makeEvidenceRepo();
    transactionRepo = makeTransactionRepo(transactionRepoOverrides);
    notificationsService = makeNotificationsService();
    usersService = makeUsersService(usersBalances);
    const qr = makeQueryRunner();
    dataSource = { createQueryRunner: jest.fn(() => qr) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: getRepositoryToken(Dispute), useValue: disputeRepo },
        {
          provide: getRepositoryToken(DisputeEvidence),
          useValue: evidenceRepo,
        },
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: LedgerService, useValue: makeLedgerService() },
        { provide: UsersService, useValue: usersService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  }

  // ── 1. Transaction older than 30 days returns 422 ──────────────────────────

  describe('createDispute – window enforcement', () => {
    it('should throw 422 when transaction is older than 30 days', async () => {
      await buildService(
        {},
        {
          findOne: jest.fn(async () =>
            makeTransaction({
              createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
            }),
          ),
        },
      );

      await expect(
        service.createDispute(RESPONDENT_ID, {
          transactionId: TX_ID,
          reason: DisputeReason.UNAUTHORIZED,
          description: 'Test',
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({
          code: 'DISPUTE_WINDOW_EXPIRED',
          daysElapsed: expect.any(Number),
        }),
      });
    });

    it('should include daysElapsed in the 422 error body', async () => {
      await buildService(
        {},
        {
          findOne: jest.fn(async () =>
            makeTransaction({
              createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
            }),
          ),
        },
      );

      try {
        await service.createDispute(RESPONDENT_ID, {
          transactionId: TX_ID,
          reason: DisputeReason.UNAUTHORIZED,
          description: 'Test',
        });
        fail('Expected UnprocessableEntityException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        expect(err.response.daysElapsed).toBeGreaterThanOrEqual(35);
      }
    });
  });

  // ── 2. PENDING transaction returns 422 ────────────────────────────────────

  describe('createDispute – pending transaction', () => {
    it('should throw 422 when transaction is PENDING', async () => {
      await buildService(
        {},
        {
          findOne: jest.fn(async () =>
            makeTransaction({ status: TransactionStatus.PENDING }),
          ),
        },
      );

      await expect(
        service.createDispute(RESPONDENT_ID, {
          transactionId: TX_ID,
          reason: DisputeReason.UNAUTHORIZED,
          description: 'Test',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ── 3. Duplicate dispute returns 409 ─────────────────────────────────────

  describe('createDispute – duplicate dispute', () => {
    it('should throw 409 when a dispute already exists for the transaction', async () => {
      await buildService(
        {
          findOne: jest.fn(async () => makeDispute()), // existing dispute found
        },
        {
          findOne: jest.fn(async () => makeTransaction()),
        },
      );

      await expect(
        service.createDispute(RESPONDENT_ID, {
          transactionId: TX_ID,
          reason: DisputeReason.UNAUTHORIZED,
          description: 'Test',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── 4. Respondent can submit evidence ────────────────────────────────────

  describe('addEvidence – respondent submission', () => {
    it('should allow the respondent to submit RESPONDENT-side evidence', async () => {
      const disputeWithTx = makeDispute();
      (disputeWithTx as any).transaction = makeTransaction({
        userId: RESPONDENT_ID,
      });

      await buildService({
        findOne: jest.fn(async () => disputeWithTx),
      });

      const result = await service.addEvidence(
        DISPUTE_ID,
        RESPONDENT_ID,
        { side: EvidenceSide.RESPONDENT, description: 'Proof of delivery' },
        ['receipt.pdf'],
      );

      expect(evidenceRepo.save).toHaveBeenCalled();
      expect(result.side).toBe(EvidenceSide.RESPONDENT);
    });
  });

  // ── 5. Claimant cannot see unreleased respondent evidence ─────────────────

  describe('getDisputeForUser – evidence visibility', () => {
    it('should hide unreleased RESPONDENT evidence from the claimant', async () => {
      const unreleasedEvidence = {
        id: 'ev-1',
        side: EvidenceSide.RESPONDENT,
        released: false,
        description: 'Hidden evidence',
      } as DisputeEvidence;

      const releasedEvidence = {
        id: 'ev-2',
        side: EvidenceSide.CLAIMANT,
        released: false,
        description: 'My own evidence',
      } as DisputeEvidence;

      const disputeWithEvidence = makeDispute({
        evidence: [unreleasedEvidence, releasedEvidence],
      });

      await buildService({
        findOne: jest.fn(async () => disputeWithEvidence),
      });

      const result = await service.getDisputeForUser(DISPUTE_ID, CLAIMANT_ID);

      // Respondent unreleased evidence must not appear
      expect(result.evidence.some((e) => e.id === 'ev-1')).toBe(false);
      // Claimant's own evidence should remain
      expect(result.evidence.some((e) => e.id === 'ev-2')).toBe(true);
    });

    it('should show released RESPONDENT evidence to the claimant', async () => {
      const releasedRespondentEvidence = {
        id: 'ev-3',
        side: EvidenceSide.RESPONDENT,
        released: true,
        description: 'Released proof',
      } as DisputeEvidence;

      const disputeWithEvidence = makeDispute({
        evidence: [releasedRespondentEvidence],
      });

      await buildService({
        findOne: jest.fn(async () => disputeWithEvidence),
      });

      const result = await service.getDisputeForUser(DISPUTE_ID, CLAIMANT_ID);
      expect(result.evidence.some((e) => e.id === 'ev-3')).toBe(true);
    });
  });

  // ── 6. Admin can view all evidence ───────────────────────────────────────

  describe('getDisputeForAdmin – full evidence view', () => {
    it('should return all evidence regardless of released status', async () => {
      const unreleasedRespondent = {
        id: 'ev-a',
        side: EvidenceSide.RESPONDENT,
        released: false,
      } as DisputeEvidence;

      const claimantEvidence = {
        id: 'ev-b',
        side: EvidenceSide.CLAIMANT,
        released: false,
      } as DisputeEvidence;

      const disputeWithEvidence = makeDispute({
        evidence: [unreleasedRespondent, claimantEvidence],
      });

      await buildService({
        findOne: jest.fn(async () => disputeWithEvidence),
      });

      const result = await service.getDisputeForAdmin(DISPUTE_ID);

      // Admin sees everything
      expect(result.evidence).toHaveLength(2);
      expect(result.evidence.some((e) => e.id === 'ev-a')).toBe(true);
      expect(result.evidence.some((e) => e.id === 'ev-b')).toBe(true);
    });
  });

  // ── 7. Chargeback creates CHARGEBACK ledger transaction ──────────────────

  describe('resolveDispute – CHARGEBACK outcome', () => {
    it('should create a CHARGEBACK transaction record via query runner', async () => {
      const dispute = makeDispute({ status: DisputeStatus.UNDER_REVIEW });
      dispute.transaction = makeTransaction({ userId: RESPONDENT_ID });

      const qr = makeQueryRunner();
      const ds = { createQueryRunner: jest.fn(() => qr) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DisputesService,
          {
            provide: getRepositoryToken(Dispute),
            useValue: {
              ...makeDisputeRepo({
                findOne: jest.fn(async () => dispute),
              }),
            },
          },
          {
            provide: getRepositoryToken(DisputeEvidence),
            useValue: makeEvidenceRepo(),
          },
          {
            provide: getRepositoryToken(Transaction),
            useValue: makeTransactionRepo(),
          },
          {
            provide: NotificationsService,
            useValue: makeNotificationsService(),
          },
          { provide: LedgerService, useValue: makeLedgerService() },
          { provide: UsersService, useValue: makeUsersService({ XLM: 500 }) },
          { provide: DataSource, useValue: ds },
        ],
      }).compile();

      const svc = module.get<DisputesService>(DisputesService);

      await svc.resolveDispute(DISPUTE_ID, ADMIN_ID, {
        outcome: DisputeOutcome.CHARGEBACK,
        resolution: 'Chargeback approved',
      });

      // Query runner should have been used (createQueryRunner called)
      expect(ds.createQueryRunner).toHaveBeenCalled();
      // manager.save should have been called (for the chargeback TX record)
      expect(qr.manager.save).toHaveBeenCalled();
    });

    it('should commit the transaction on success', async () => {
      const dispute = makeDispute({ status: DisputeStatus.UNDER_REVIEW });
      dispute.transaction = makeTransaction({ userId: RESPONDENT_ID });

      const qr = makeQueryRunner();
      const ds = { createQueryRunner: jest.fn(() => qr) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DisputesService,
          {
            provide: getRepositoryToken(Dispute),
            useValue: {
              ...makeDisputeRepo({ findOne: jest.fn(async () => dispute) }),
            },
          },
          {
            provide: getRepositoryToken(DisputeEvidence),
            useValue: makeEvidenceRepo(),
          },
          {
            provide: getRepositoryToken(Transaction),
            useValue: makeTransactionRepo(),
          },
          {
            provide: NotificationsService,
            useValue: makeNotificationsService(),
          },
          { provide: LedgerService, useValue: makeLedgerService() },
          { provide: UsersService, useValue: makeUsersService({ XLM: 500 }) },
          { provide: DataSource, useValue: ds },
        ],
      }).compile();

      const svc = module.get<DisputesService>(DisputesService);
      await svc.resolveDispute(DISPUTE_ID, ADMIN_ID, {
        outcome: DisputeOutcome.CHARGEBACK,
        resolution: 'Approved',
      });

      expect(qr.commitTransaction).toHaveBeenCalled();
      expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    });
  });

  // ── 8. Chargeback debits respondent and credits claimant ─────────────────

  describe('resolveDispute – CHARGEBACK balance update', () => {
    it('should debit respondent and credit claimant when funds are sufficient', async () => {
      const dispute = makeDispute({ status: DisputeStatus.UNDER_REVIEW });
      const originalTx = makeTransaction({
        userId: RESPONDENT_ID,
        amount: '50.00000000',
        currency: 'XLM',
      });
      dispute.transaction = originalTx;

      const respondentUser = {
        id: RESPONDENT_ID,
        balances: { XLM: 500 },
        fcmTokens: [],
      };
      const claimantUser = {
        id: CLAIMANT_ID,
        balances: { XLM: 100 },
        fcmTokens: [],
      };

      const qr = makeQueryRunner();
      const ds = { createQueryRunner: jest.fn(() => qr) };

      // Track which users are saved
      const savedUsers: any[] = [];
      qr.manager.save = jest.fn(async (arg1: any, arg2: any) => {
        const data = arg2 !== undefined ? arg2 : arg1;
        if (data && data.id) savedUsers.push(data);
        return { id: 'new-chargeback-tx', ...data };
      });

      const usrSvc = {
        findById: jest.fn(async (id: string) => {
          if (id === RESPONDENT_ID) return respondentUser;
          if (id === CLAIMANT_ID) return claimantUser;
          return null;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DisputesService,
          {
            provide: getRepositoryToken(Dispute),
            useValue: makeDisputeRepo({
              findOne: jest.fn(async () => dispute),
            }),
          },
          {
            provide: getRepositoryToken(DisputeEvidence),
            useValue: makeEvidenceRepo(),
          },
          {
            provide: getRepositoryToken(Transaction),
            useValue: makeTransactionRepo(),
          },
          {
            provide: NotificationsService,
            useValue: makeNotificationsService(),
          },
          { provide: LedgerService, useValue: makeLedgerService() },
          { provide: UsersService, useValue: usrSvc },
          { provide: DataSource, useValue: ds },
        ],
      }).compile();

      const svc = module.get<DisputesService>(DisputesService);
      await svc.resolveDispute(DISPUTE_ID, ADMIN_ID, {
        outcome: DisputeOutcome.CHARGEBACK,
        resolution: 'Approved',
      });

      // Check that respondent was debited and claimant credited
      const respondentSaved = savedUsers.find((u) => u.id === RESPONDENT_ID);
      const claimantSaved = savedUsers.find((u) => u.id === CLAIMANT_ID);

      expect(respondentSaved?.balances?.XLM).toBe(450); // 500 - 50
      expect(claimantSaved?.balances?.XLM).toBe(150); // 100 + 50
    });
  });

  // ── 9. Both parties notified on resolution ────────────────────────────────

  describe('resolveDispute – notifications', () => {
    it('should notify claimant and respondent on VALID resolution', async () => {
      const dispute = makeDispute({ status: DisputeStatus.OPEN });
      const originalTx = makeTransaction({ userId: RESPONDENT_ID });
      dispute.transaction = originalTx;

      const qr = makeQueryRunner();
      const ds = { createQueryRunner: jest.fn(() => qr) };
      const notifications = makeNotificationsService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DisputesService,
          {
            provide: getRepositoryToken(Dispute),
            useValue: makeDisputeRepo({
              findOne: jest.fn(async () => dispute),
            }),
          },
          {
            provide: getRepositoryToken(DisputeEvidence),
            useValue: makeEvidenceRepo(),
          },
          {
            provide: getRepositoryToken(Transaction),
            useValue: makeTransactionRepo(),
          },
          { provide: NotificationsService, useValue: notifications },
          { provide: LedgerService, useValue: makeLedgerService() },
          { provide: UsersService, useValue: makeUsersService({ XLM: 500 }) },
          { provide: DataSource, useValue: ds },
        ],
      }).compile();

      const svc = module.get<DisputesService>(DisputesService);
      await svc.resolveDispute(DISPUTE_ID, ADMIN_ID, {
        outcome: DisputeOutcome.VALID,
        resolution: 'Claim validated',
      });

      // Should have been called twice – once for claimant, once for respondent
      expect(notifications.create).toHaveBeenCalledTimes(2);

      const calls = (notifications.create as jest.Mock).mock.calls;
      const userIds = calls.map((c: any[]) => c[0].userId);
      expect(userIds).toContain(CLAIMANT_ID);
      expect(userIds).toContain(RESPONDENT_ID);
    });
  });

  // ── Extra: already-resolved dispute throws 400 ───────────────────────────

  describe('resolveDispute – idempotency guard', () => {
    it('should throw 400 when dispute is already resolved', async () => {
      const dispute = makeDispute({ status: DisputeStatus.RESOLVED_VALID });
      dispute.transaction = makeTransaction({ userId: RESPONDENT_ID });

      await buildService({
        findOne: jest.fn(async () => dispute),
      });

      await expect(
        service.resolveDispute(DISPUTE_ID, ADMIN_ID, {
          outcome: DisputeOutcome.VALID,
          resolution: 'Duplicate',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
