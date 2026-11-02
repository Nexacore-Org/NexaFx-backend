jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: any) =>
    `${typeof entity === 'function' ? entity.name : String(entity)}Repository`,
  TypeOrmModule: { forFeature: () => ({}), forRoot: () => ({}) },
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => {},
  ApiPropertyOptional: () => () => {},
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
  ApiResponse: () => () => {},
  ApiBearerAuth: () => () => {},
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: () => () => {},
  WebSocketServer: () => () => {},
  SubscribeMessage: () => () => {},
}));

jest.mock('../firebase/fcm.service', () => ({
  FCMService: class FCMService {},
}));

jest.mock('../modules/mail/mail.service', () => ({
  MailService: class MailService {},
}));

jest.mock('../notifications/notifications.gateway', () => ({
  NotificationsGateway: class NotificationsGateway {},
}));

import { LoansService } from './loans.service';
import { LoanStatus } from './entities/loan-application.entity';
import { RepaymentStatus } from './entities/loan-repayment.entity';
import { UserKycTier } from '../users/user.entity';
import { NotificationType } from '../notifications/entities/notification.entity';

describe('LoansService notifications', () => {
  let service: LoansService;
  let loanRepo: any;
  let repaymentRepo: any;
  let complianceFlagRepo: any;
  let transactionRepo: any;
  let creditScoringService: any;
  let usersService: any;
  let dataSource: any;
  let notificationsService: any;

  beforeEach(() => {
    loanRepo = {
      create: jest.fn((data) => ({ id: 'loan-1', ...data })),
      save: jest.fn(async (entity) => ({ id: 'loan-1', ...entity })),
      findOne: jest.fn(),
    };
    repaymentRepo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (entity) => entity),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    complianceFlagRepo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (entity) => entity),
    };
    transactionRepo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (entity) => entity),
    };
    creditScoringService = {
      score: jest.fn(),
    };
    usersService = {
      findById: jest.fn(),
    };
    dataSource = {
      createQueryRunner: jest.fn(),
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue(null),
    };

    service = new LoansService(
      loanRepo,
      repaymentRepo,
      complianceFlagRepo,
      transactionRepo,
      creditScoringService,
      usersService,
      dataSource,
      notificationsService,
    );
  });

  it('notifies borrower with LOAN_REJECTED when auto-rejected on low credit score', async () => {
    usersService.findById.mockResolvedValue({
      id: 'borrower-1',
      kycTier: UserKycTier.ENHANCED,
    });
    creditScoringService.score.mockResolvedValue(25);

    const loan = await service.applyForLoan('borrower-1', {
      requestedAmount: 100,
      termDays: 30,
    });

    expect(loan.status).toBe(LoanStatus.REJECTED);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_REJECTED,
        relatedId: 'loan-1',
      }),
    );
  });

  it('notifies borrower with LOAN_APPROVED when admin approves loan', async () => {
    const mockLoan = {
      id: 'loan-1',
      userId: 'borrower-1',
      requestedAmount: '100.00000000',
      currency: 'XLM',
      termDays: 30,
      status: LoanStatus.PENDING,
    };
    loanRepo.findOne.mockResolvedValue({ ...mockLoan });
    usersService.findById.mockResolvedValue({
      id: 'borrower-1',
      balances: { XLM: 50 },
    });

    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...mockLoan })
          .mockResolvedValueOnce({
            id: 'borrower-1',
            balances: { XLM: 50 },
          })
          .mockResolvedValueOnce({
            ...mockLoan,
            status: LoanStatus.ACTIVE,
            approvedAmount: '100.00000000',
            repayments: [],
          }),
        save: jest.fn(async (_entity, data) => ({ id: 'tx-1', ...data })),
        create: jest.fn((_entity, data) => data),
        update: jest.fn(),
      },
    };
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    const result = await service.adminApproveLoan('admin-1', 'loan-1', {
      approvedAmount: 100,
      interestRatePercent: 12,
    });

    expect(result.status).toBe(LoanStatus.ACTIVE);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_APPROVED,
        relatedId: 'loan-1',
      }),
    );
  });

  it('notifies borrower with LOAN_REJECTED when admin rejects loan', async () => {
    loanRepo.findOne.mockResolvedValue({
      id: 'loan-1',
      userId: 'borrower-1',
      status: LoanStatus.PENDING,
    });

    const result = await service.adminRejectLoan('admin-1', 'loan-1', {
      reason: 'Insufficient collateral history',
    });

    expect(result.status).toBe(LoanStatus.REJECTED);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_REJECTED,
        relatedId: 'loan-1',
      }),
    );
  });

  it('emits LOAN_REPAYMENT_DUE and LOAN_OVERDUE when scheduled repayment has insufficient balance', async () => {
    const dueRepayment = {
      id: 'rep-1',
      loanId: 'loan-1',
      dueDate: '2026-01-01',
      totalDue: '50.00000000',
      paidAmount: '0.00000000',
      status: RepaymentStatus.SCHEDULED,
      loan: {
        id: 'loan-1',
        userId: 'borrower-1',
        currency: 'XLM',
        status: LoanStatus.ACTIVE,
      },
    };

    repaymentRepo.createQueryBuilder.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([dueRepayment]),
    });
    usersService.findById.mockResolvedValue({
      id: 'borrower-1',
      balances: { XLM: 10 },
    });

    await service.processScheduledRepayments();

    expect(dueRepayment.status).toBe(RepaymentStatus.OVERDUE);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_REPAYMENT_DUE,
        relatedId: 'loan-1',
      }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_OVERDUE,
        relatedId: 'loan-1',
      }),
    );
  });

  it('emits LOAN_OVERDUE and LOAN_DEFAULTED when overdue repayment reaches 7 days', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    repaymentRepo.find.mockResolvedValue([
      {
        id: 'rep-overdue-1',
        loanId: 'loan-1',
        dueDate: eightDaysAgo,
        totalDue: '100.00000000',
        penaltyAmount: '0.00000000',
        paidAmount: '0.00000000',
        status: RepaymentStatus.OVERDUE,
        lastPenaltyAppliedAt: null,
        loan: {
          id: 'loan-1',
          userId: 'borrower-1',
          currency: 'XLM',
          status: LoanStatus.ACTIVE,
        },
      },
    ]);

    await service.applyOverduePenalties();

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_OVERDUE,
        relatedId: 'loan-1',
      }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'borrower-1',
        type: NotificationType.LOAN_DEFAULTED,
        relatedId: 'loan-1',
      }),
    );
  });
});
