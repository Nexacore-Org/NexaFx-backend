import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LoanApplication, LoanStatus } from './entities/loan-application.entity';
import { LoanRepayment, RepaymentStatus } from './entities/loan-repayment.entity';
import { ComplianceFlag } from './entities/compliance-flag.entity';
import { CreditScoringService } from './credit-scoring.service';
import { UsersService } from '../users/users.service';
import {
  ApplyLoanDto,
  RepayLoanDto,
  AdminApproveLoanDto,
  AdminRejectLoanDto,
} from './dto/loan.dto';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import {
  LedgerEntry,
  LedgerAccountType,
  LedgerDirection,
} from '../ledger/entities/ledger-entry.entity';
import { UserKycTier } from '../users/user.entity';

const MIN_CREDIT_SCORE = 40;
const DAILY_PENALTY_RATE = 0.005;
const DEFAULT_AFTER_OVERDUE_DAYS = 7;

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectRepository(LoanApplication)
    private readonly loanRepo: Repository<LoanApplication>,
    @InjectRepository(LoanRepayment)
    private readonly repaymentRepo: Repository<LoanRepayment>,
    @InjectRepository(ComplianceFlag)
    private readonly complianceFlagRepo: Repository<ComplianceFlag>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly creditScoringService: CreditScoringService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async applyForLoan(userId: string, dto: ApplyLoanDto): Promise<LoanApplication> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (
      user.kycTier !== UserKycTier.ENHANCED &&
      user.kycTier !== UserKycTier.FULL
    ) {
      throw new ForbiddenException(
        'ENHANCED KYC verification is required to apply for a loan',
      );
    }

    const creditScore = await this.creditScoringService.score(userId);

    if (creditScore < MIN_CREDIT_SCORE) {
      const rejected = this.loanRepo.create({
        userId,
        requestedAmount: dto.requestedAmount.toString(),
        currency: 'XLM',
        termDays: dto.termDays,
        interestRatePercent: '0',
        status: LoanStatus.REJECTED,
        creditScore,
        rejectionReason: `Credit score ${creditScore} is below minimum required score of ${MIN_CREDIT_SCORE}`,
      });
      return this.loanRepo.save(rejected);
    }

    const application = this.loanRepo.create({
      userId,
      requestedAmount: dto.requestedAmount.toString(),
      currency: 'XLM',
      termDays: dto.termDays,
      interestRatePercent: '0',
      status: LoanStatus.PENDING,
      creditScore,
    });

    return this.loanRepo.save(application);
  }

  async getUserLoans(userId: string): Promise<LoanApplication[]> {
    return this.loanRepo.find({
      where: { userId },
      relations: ['repayments'],
      order: { createdAt: 'DESC' },
    });
  }

  async getLoanById(userId: string, loanId: string): Promise<LoanApplication> {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId, userId },
      relations: ['repayments'],
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  async repayLoan(
    userId: string,
    loanId: string,
    dto: RepayLoanDto,
  ): Promise<{ message: string; repayment: LoanRepayment }> {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId, userId },
      relations: ['repayments'],
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE loans can be repaid');
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const balance = parseFloat((user.balances?.['XLM'] ?? 0).toString());
    if (balance < dto.amount) {
      throw new BadRequestException(
        `Insufficient XLM balance. Available: ${balance}, required: ${dto.amount}`,
      );
    }

    // Find the earliest unpaid repayment
    const pendingRepayments = loan.repayments
      .filter((r) =>
        r.status === RepaymentStatus.SCHEDULED ||
        r.status === RepaymentStatus.PARTIAL ||
        r.status === RepaymentStatus.OVERDUE,
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (pendingRepayments.length === 0) {
      throw new BadRequestException('No outstanding repayments');
    }

    const repayment = pendingRepayments[0];
    const remainingDue =
      parseFloat(repayment.totalDue) - parseFloat(repayment.paidAmount);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payAmount = Math.min(dto.amount, remainingDue);
      const newPaidAmount = parseFloat(repayment.paidAmount) + payAmount;

      repayment.paidAmount = newPaidAmount.toFixed(8);
      repayment.status =
        newPaidAmount >= parseFloat(repayment.totalDue) - 0.000000005
          ? RepaymentStatus.PAID
          : RepaymentStatus.PARTIAL;

      if (repayment.status === RepaymentStatus.PAID) {
        repayment.paidAt = new Date();
      }

      await queryRunner.manager.save(LoanRepayment, repayment);

      // Debit user balance
      const newBalance = balance - payAmount;
      await queryRunner.manager.update('users', userId, {
        balances: { ...user.balances, XLM: newBalance },
      });

      // Create internal transaction record
      const tx = queryRunner.manager.create(Transaction, {
        userId,
        type: TransactionType.LOAN_REPAYMENT,
        amount: payAmount.toFixed(8),
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        metadata: { loanId, repaymentId: repayment.id },
      });
      const savedTx = await queryRunner.manager.save(Transaction, tx);

      // Ledger: USER DEBIT + PLATFORM_ASSET CREDIT
      await queryRunner.manager.save(LedgerEntry, [
        queryRunner.manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.DEBIT,
          amount: payAmount.toFixed(8),
          currency: 'XLM',
        }),
        queryRunner.manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.CREDIT,
          amount: payAmount.toFixed(8),
          currency: 'XLM',
        }),
      ]);

      // Check if all repayments are paid
      const allRepayments = await queryRunner.manager.find(LoanRepayment, {
        where: { loanId },
      });
      const allPaid = allRepayments.every(
        (r) => r.status === RepaymentStatus.PAID || r.status === RepaymentStatus.WAIVED,
      );

      if (allPaid) {
        await queryRunner.manager.update(LoanApplication, loanId, {
          status: LoanStatus.REPAID,
        });
        loan.status = LoanStatus.REPAID;
      }

      await queryRunner.commitTransaction();

      return { message: 'Repayment recorded successfully', repayment };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Admin methods ───────────────────────────────────────────────────────────

  async adminGetLoans(
    page = 1,
    limit = 20,
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const [data, total] = await this.loanRepo.findAndCount({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async adminApproveLoan(
    adminId: string,
    loanId: string,
    dto: AdminApproveLoanDto,
  ): Promise<LoanApplication> {
    const loan = await this.loanRepo.findOne({
      where: { id: loanId },
      relations: ['repayments'],
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.PENDING) {
      throw new BadRequestException('Only PENDING loans can be approved');
    }

    const user = await this.usersService.findById(loan.userId);
    if (!user) throw new NotFoundException('Loan applicant not found');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = new Date();
      const dueDate = new Date(
        now.getTime() + loan.termDays * 24 * 60 * 60 * 1000,
      );

      // Update loan to ACTIVE
      loan.status = LoanStatus.ACTIVE;
      loan.approvedAmount = dto.approvedAmount.toString();
      loan.interestRatePercent = dto.interestRatePercent.toString();
      loan.reviewedBy = adminId;
      loan.disbursedAt = now;
      loan.dueDate = dueDate;

      await queryRunner.manager.save(LoanApplication, loan);

      // Credit user balance (LOAN_DISBURSEMENT)
      const currentBalance = parseFloat(
        (user.balances?.['XLM'] ?? 0).toString(),
      );
      const newBalance = currentBalance + dto.approvedAmount;
      await queryRunner.manager.update('users', loan.userId, {
        balances: { ...user.balances, XLM: newBalance },
      });

      // Create internal transaction record for disbursement
      const tx = queryRunner.manager.create(Transaction, {
        userId: loan.userId,
        type: TransactionType.LOAN_DISBURSEMENT,
        amount: dto.approvedAmount.toFixed(8),
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        metadata: { loanId: loan.id, approvedBy: adminId },
      });
      const savedTx = await queryRunner.manager.save(Transaction, tx);

      // Ledger: USER CREDIT + PLATFORM_LIABILITY DEBIT
      await queryRunner.manager.save(LedgerEntry, [
        queryRunner.manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.CREDIT,
          amount: dto.approvedAmount.toFixed(8),
          currency: 'XLM',
        }),
        queryRunner.manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          accountType: LedgerAccountType.PLATFORM_LIABILITY,
          direction: LedgerDirection.DEBIT,
          amount: dto.approvedAmount.toFixed(8),
          currency: 'XLM',
        }),
      ]);

      // Build repayment schedule
      const repayments = this.buildRepaymentSchedule(loan, dto);
      for (const repayment of repayments) {
        await queryRunner.manager.save(LoanRepayment, repayment);
      }

      await queryRunner.commitTransaction();

      return queryRunner.manager.findOne(LoanApplication, {
        where: { id: loanId },
        relations: ['repayments'],
      }) as Promise<LoanApplication>;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async adminRejectLoan(
    adminId: string,
    loanId: string,
    dto: AdminRejectLoanDto,
  ): Promise<LoanApplication> {
    const loan = await this.loanRepo.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.PENDING) {
      throw new BadRequestException('Only PENDING loans can be rejected');
    }

    loan.status = LoanStatus.REJECTED;
    loan.reviewedBy = adminId;
    loan.rejectionReason = dto.reason ?? 'Application rejected by admin';
    return this.loanRepo.save(loan);
  }

  // ── Cron-called methods ────────────────────────────────────────────────────

  async processScheduledRepayments(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const dueRepayments = await this.repaymentRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.loan', 'loan')
      .where('r.status = :status', { status: RepaymentStatus.SCHEDULED })
      .andWhere('r.dueDate <= :today', { today })
      .getMany();

    for (const repayment of dueRepayments) {
      try {
        await this.autoDebitRepayment(repayment);
      } catch (err) {
        this.logger.error(
          `Failed to auto-debit repayment ${repayment.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async applyOverduePenalties(): Promise<void> {
    const overdueRepayments = await this.repaymentRepo.find({
      where: { status: RepaymentStatus.OVERDUE },
      relations: ['loan'],
    });

    for (const repayment of overdueRepayments) {
      try {
        const overdueSince = await this.getOverdueSinceDays(repayment);

        // Apply daily penalty on the outstanding amount
        const outstanding =
          parseFloat(repayment.totalDue) - parseFloat(repayment.paidAmount);
        const dailyPenalty = outstanding * DAILY_PENALTY_RATE;
        const newPenalty =
          parseFloat(repayment.penaltyAmount) + dailyPenalty;
        const newTotalDue =
          parseFloat(repayment.totalDue) + dailyPenalty;

        repayment.penaltyAmount = newPenalty.toFixed(8);
        repayment.totalDue = newTotalDue.toFixed(8);
        await this.repaymentRepo.save(repayment);

        // After 7 days: default the loan
        if (overdueSince >= DEFAULT_AFTER_OVERDUE_DAYS) {
          await this.defaultLoan(repayment.loan);
        }
      } catch (err) {
        this.logger.error(
          `Failed to apply penalty for repayment ${repayment.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildRepaymentSchedule(
    loan: LoanApplication,
    dto: AdminApproveLoanDto,
  ): Partial<LoanRepayment>[] {
    const instalments = loan.termDays === 30 ? 1 : loan.termDays / 30;
    const principal = dto.approvedAmount / instalments;
    const annualRate = dto.interestRatePercent / 100;
    const monthlyRate = annualRate / 12;
    const interestPerInstalment = (dto.approvedAmount * monthlyRate);

    const repayments: Partial<LoanRepayment>[] = [];
    const startDate = new Date();

    for (let i = 1; i <= instalments; i++) {
      const dueDate = new Date(
        startDate.getTime() + i * 30 * 24 * 60 * 60 * 1000,
      );
      const totalDue = principal + interestPerInstalment;

      repayments.push({
        loanId: loan.id,
        dueDate: dueDate.toISOString().split('T')[0],
        principalAmount: principal.toFixed(8),
        interestAmount: interestPerInstalment.toFixed(8),
        penaltyAmount: '0.00000000',
        totalDue: totalDue.toFixed(8),
        paidAmount: '0.00000000',
        status: RepaymentStatus.SCHEDULED,
        paidAt: null,
      });
    }

    return repayments;
  }

  private async autoDebitRepayment(repayment: LoanRepayment): Promise<void> {
    const loan = repayment.loan;
    if (loan.status !== LoanStatus.ACTIVE) return;

    const user = await this.usersService.findById(loan.userId);
    if (!user) return;

    const balance = parseFloat((user.balances?.['XLM'] ?? 0).toString());
    const amountDue =
      parseFloat(repayment.totalDue) - parseFloat(repayment.paidAmount);

    if (balance < amountDue) {
      // Mark overdue on insufficient balance
      repayment.status = RepaymentStatus.OVERDUE;
      await this.repaymentRepo.save(repayment);
      this.logger.warn(
        `Repayment ${repayment.id} marked OVERDUE — insufficient balance`,
      );
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newBalance = balance - amountDue;
      await queryRunner.manager.update('users', loan.userId, {
        balances: { ...user.balances, XLM: newBalance },
      });

      // Transaction record
      const tx = queryRunner.manager.create(Transaction, {
        userId: loan.userId,
        type: TransactionType.LOAN_REPAYMENT,
        amount: amountDue.toFixed(8),
        currency: 'XLM',
        status: TransactionStatus.SUCCESS,
        metadata: { loanId: loan.id, repaymentId: repayment.id, auto: true },
      });
      const savedTx = await queryRunner.manager.save(Transaction, tx);

      // Ledger entries
      await queryRunner.manager.save(LedgerEntry, [
        queryRunner.manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          accountType: LedgerAccountType.USER,
          direction: LedgerDirection.DEBIT,
          amount: amountDue.toFixed(8),
          currency: 'XLM',
        }),
        queryRunner.manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          accountType: LedgerAccountType.PLATFORM_ASSET,
          direction: LedgerDirection.CREDIT,
          amount: amountDue.toFixed(8),
          currency: 'XLM',
        }),
      ]);

      repayment.paidAmount = repayment.totalDue;
      repayment.status = RepaymentStatus.PAID;
      repayment.paidAt = new Date();
      await queryRunner.manager.save(LoanRepayment, repayment);

      // Check if all repayments done
      const allRepayments = await queryRunner.manager.find(LoanRepayment, {
        where: { loanId: loan.id },
      });
      const allPaid = allRepayments.every(
        (r) =>
          r.status === RepaymentStatus.PAID ||
          r.status === RepaymentStatus.WAIVED,
      );
      if (allPaid) {
        await queryRunner.manager.update(LoanApplication, loan.id, {
          status: LoanStatus.REPAID,
        });
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async getOverdueSinceDays(repayment: LoanRepayment): Promise<number> {
    // dueDate is a date string 'YYYY-MM-DD'
    const due = new Date(repayment.dueDate);
    const now = new Date();
    const diff = now.getTime() - due.getTime();
    return Math.floor(diff / (24 * 60 * 60 * 1000));
  }

  private async defaultLoan(loan: LoanApplication): Promise<void> {
    if (loan.status === LoanStatus.DEFAULTED) return;

    loan.status = LoanStatus.DEFAULTED;
    await this.loanRepo.save(loan);

    await this.complianceFlagRepo.save(
      this.complianceFlagRepo.create({
        userId: loan.userId,
        reason: `Loan ${loan.id} defaulted after ${DEFAULT_AFTER_OVERDUE_DAYS} days overdue`,
        entityId: loan.id,
        isResolved: false,
      }),
    );

    this.logger.warn(`Loan ${loan.id} defaulted for user ${loan.userId}`);
  }
}
