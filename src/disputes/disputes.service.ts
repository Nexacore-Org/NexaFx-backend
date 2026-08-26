import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, FindOptionsWhere, LessThan, MoreThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import {
  DisputeEvidence,
  EvidenceSide,
} from './entities/dispute-evidence.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { AddEvidenceDto } from './dto/add-evidence.dto';
import { ResolveDisputeDto, DisputeOutcome } from './dto/resolve-dispute.dto';
import { AssignDisputeDto } from './dto/assign-dispute.dto';
import { DisputeQueryDto } from './dto/dispute-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enum/notificationType.enum';
import { LedgerService } from '../ledger/services/ledger.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';

/** Number of days within which a completed transaction may be disputed. */
const DISPUTE_WINDOW_DAYS = 30;

/** SLA business days for dispute resolution. */
const SLA_DISPUTE_BUSINESS_DAYS = 5;

/** Metadata key used to link a chargeback to its origin. */
const CHARGEBACK_META_KEY = 'originalTransactionId';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(DisputeEvidence)
    private readonly evidenceRepo: Repository<DisputeEvidence>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly ledgerService: LedgerService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  // ── User APIs ───────────────────────────────────────────────────────────────

  /**
   * Raise a new dispute for a completed transaction.
   *
   * Business rules enforced:
   *  - Transaction must exist and belong to the requesting user.
   *  - Transaction must be in COMPLETED (SUCCESS) status.
   *  - Transaction must be within the 30-day dispute window.
   *  - Only one dispute per transaction (409 on duplicate).
   */
  async createDispute(userId: string, dto: CreateDisputeDto): Promise<Dispute> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: dto.transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.userId !== userId) {
      throw new ForbiddenException(
        'You can only dispute your own transactions',
      );
    }

    // Only COMPLETED (SUCCESS) transactions can be disputed
    if (transaction.status === TransactionStatus.PENDING) {
      throw new UnprocessableEntityException({
        code: 'TRANSACTION_PENDING',
        message:
          'Cannot dispute a PENDING transaction. Wait for it to complete first.',
      });
    }

    if (transaction.status !== TransactionStatus.SUCCESS) {
      throw new UnprocessableEntityException({
        code: 'TRANSACTION_NOT_COMPLETED',
        message: `Only COMPLETED transactions can be disputed. Current status: ${transaction.status}`,
      });
    }

    // Enforce 30-day window
    const now = new Date();
    const msElapsed = now.getTime() - transaction.createdAt.getTime();
    const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));

    if (daysElapsed > DISPUTE_WINDOW_DAYS) {
      throw new UnprocessableEntityException({
        code: 'DISPUTE_WINDOW_EXPIRED',
        message: `Dispute window expired. The transaction is ${daysElapsed} day(s) old (limit: ${DISPUTE_WINDOW_DAYS} days).`,
        daysElapsed,
      });
    }

    // One dispute per transaction
    const existing = await this.disputeRepo.findOne({
      where: { transactionId: dto.transactionId },
    });
    if (existing) {
      throw new ConflictException(
        'A dispute already exists for this transaction',
      );
    }

    const windowExpiry = new Date(transaction.createdAt);
    windowExpiry.setDate(windowExpiry.getDate() + DISPUTE_WINDOW_DAYS);

    const slaDeadline = new Date(now);
    slaDeadline.setDate(slaDeadline.getDate() + SLA_DISPUTE_BUSINESS_DAYS);

    const dispute = this.disputeRepo.create({
      transactionId: dto.transactionId,
      raisedById: userId,
      reason: dto.reason,
      description: dto.description,
      status: DisputeStatus.OPEN,
      disputeWindowExpiry: windowExpiry,
      slaDeadline,
      resolvedAt: null,
      resolution: null,
      assignedAdminId: null,
    });

    const saved = await this.disputeRepo.save(dispute);
    this.logger.log(
      `Dispute ${saved.id} created for transaction ${dto.transactionId}`,
    );
    return saved;
  }

  /**
   * List disputes raised by the requesting user (paginated).
   */
  async listUserDisputes(
    userId: string,
    query: DisputeQueryDto,
  ): Promise<{ disputes: Dispute[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Dispute> = { raisedById: userId };
    if (query.status) where.status = query.status;
    if (query.reason) where.reason = query.reason;

    const [disputes, total] = await this.disputeRepo
      .createQueryBuilder('dispute')
      .where(where)
      .orderBy('dispute.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { disputes, total };
  }

  /**
   * Get a single dispute. Claimant can only see their own.
   * Respondent evidence is filtered out unless `released = true`.
   */
  async getDisputeForUser(disputeId: string, userId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: ['evidence'],
    });

    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.raisedById !== userId) {
      throw new ForbiddenException('You do not have access to this dispute');
    }

    // Filter out unreleased respondent evidence for the claimant
    dispute.evidence = (dispute.evidence ?? []).filter(
      (e) => e.side !== EvidenceSide.RESPONDENT || e.released,
    );

    return dispute;
  }

  /**
   * Submit evidence for an open/under-review dispute.
   *
   * Rules:
   *  - Dispute must be OPEN or UNDER_REVIEW.
   *  - Only the claimant (raisedBy) can submit CLAIMANT-side evidence.
   *  - Any authenticated user linked to the transaction as respondent
   *    can submit RESPONDENT-side evidence.
   */
  async addEvidence(
    disputeId: string,
    userId: string,
    dto: AddEvidenceDto,
    attachmentKeys: string[],
  ): Promise<DisputeEvidence> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: ['transaction'],
    });

    if (!dispute) throw new NotFoundException('Dispute not found');

    if (
      dispute.status !== DisputeStatus.OPEN &&
      dispute.status !== DisputeStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        `Evidence can only be submitted while the dispute is OPEN or UNDER_REVIEW. Current status: ${dispute.status}`,
      );
    }

    // Determine the respondent (the other party on the transaction)
    const respondentId =
      dispute.transaction?.userId === dispute.raisedById
        ? null // same user edge-case – admin will handle
        : dispute.transaction?.userId;

    const isClaimant = userId === dispute.raisedById;
    const isRespondent = respondentId ? userId === respondentId : false;

    if (dto.side === EvidenceSide.CLAIMANT && !isClaimant) {
      throw new ForbiddenException(
        'Only the claimant can submit CLAIMANT-side evidence',
      );
    }
    if (dto.side === EvidenceSide.RESPONDENT && !isRespondent && !isClaimant) {
      throw new ForbiddenException('You are not a party to this dispute');
    }
    if (dto.side === EvidenceSide.ADMIN) {
      throw new ForbiddenException(
        'ADMIN-side evidence must be submitted by an admin',
      );
    }

    const evidence = this.evidenceRepo.create({
      disputeId,
      submittedById: userId,
      side: dto.side,
      description: dto.description,
      attachmentKeys,
      released: false,
    });

    const saved = await this.evidenceRepo.save(evidence);
    this.logger.log(`Evidence ${saved.id} added to dispute ${disputeId}`);
    return saved;
  }

  // ── Admin APIs ──────────────────────────────────────────────────────────────

  /**
   * Admin: list all disputes with optional status/reason filter.
   */
  async listAllDisputes(
    query: DisputeQueryDto,
  ): Promise<{ disputes: Dispute[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Dispute> = {};
    if (query.status) where.status = query.status;
    if (query.reason) where.reason = query.reason;

    const [disputes, total] = await this.disputeRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { disputes, total };
  }

  /**
   * Admin: assign a dispute to an admin user.
   * Sets status to UNDER_REVIEW if still OPEN.
   */
  async assignDispute(
    disputeId: string,
    dto: AssignDisputeDto,
  ): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    // Verify admin user exists
    const admin = await this.usersService.findById(dto.adminId);
    if (!admin) throw new NotFoundException('Admin user not found');

    dispute.assignedAdminId = dto.adminId;
    if (dispute.status === DisputeStatus.OPEN) {
      dispute.status = DisputeStatus.UNDER_REVIEW;
    }

    const saved = await this.disputeRepo.save(dispute);
    this.logger.log(`Dispute ${disputeId} assigned to admin ${dto.adminId}`);
    return saved;
  }

  /**
   * Admin: get full dispute view including all evidence (both sides, unreleased).
   */
  async getDisputeForAdmin(disputeId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: ['evidence', 'transaction', 'raisedBy', 'assignedAdmin'],
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  /**
   * Admin: add ADMIN-side evidence and/or release respondent evidence.
   */
  async addAdminEvidence(
    disputeId: string,
    adminId: string,
    dto: AddEvidenceDto,
    attachmentKeys: string[],
  ): Promise<DisputeEvidence> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const evidence = this.evidenceRepo.create({
      disputeId,
      submittedById: adminId,
      side: EvidenceSide.ADMIN,
      description: dto.description,
      attachmentKeys,
      released: true,
    });

    return this.evidenceRepo.save(evidence);
  }

  /**
   * Admin: release all respondent evidence for this dispute so claimant can see it.
   */
  async releaseRespondentEvidence(disputeId: string): Promise<void> {
    await this.evidenceRepo.update(
      { disputeId, side: EvidenceSide.RESPONDENT },
      { released: true },
    );
    this.logger.log(`Respondent evidence released for dispute ${disputeId}`);
  }

  /**
   * Admin: resolve a dispute.
   *
   * Outcomes:
   *  - VALID   → status = RESOLVED_VALID, notify both parties.
   *  - CHARGEBACK → create CHARGEBACK transaction via existing TransactionsService/
   *                 ledger system, notify both parties. If respondent has
   *                 insufficient balance, mark chargeback PENDING_FUNDS.
   */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: ResolveDisputeDto,
  ): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: ['transaction'],
    });

    if (!dispute) throw new NotFoundException('Dispute not found');

    if (
      dispute.status === DisputeStatus.RESOLVED_VALID ||
      dispute.status === DisputeStatus.RESOLVED_CHARGEBACK ||
      dispute.status === DisputeStatus.CLOSED
    ) {
      throw new BadRequestException(
        `Dispute is already resolved (status: ${dispute.status})`,
      );
    }

    const originalTx = dispute.transaction;
    if (!originalTx)
      throw new NotFoundException('Original transaction not found');

    const now = new Date();

    if (dto.outcome === DisputeOutcome.VALID) {
      dispute.status = DisputeStatus.RESOLVED_VALID;
    } else {
      // CHARGEBACK: create via ledger using DataSource query runner
      await this.processChargeback(dispute, originalTx, adminId);
      dispute.status = DisputeStatus.RESOLVED_CHARGEBACK;
    }

    dispute.resolution = dto.resolution;
    dispute.resolvedAt = now;
    dispute.assignedAdminId = adminId;

    const saved = await this.disputeRepo.save(dispute);

    // Notify both parties
    await this.notifyResolution(dispute, originalTx, dto.outcome);

    this.logger.log(
      `Dispute ${disputeId} resolved: outcome=${dto.outcome} by admin ${adminId}`,
    );
    return saved;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Process a chargeback by creating a CHARGEBACK-type transaction via the
   * existing ledger system. Debit respondent wallet, credit claimant wallet.
   *
   * If the respondent has insufficient balance, we save the chargeback
   * transaction with status PENDING and metadata { pendingFunds: true }
   * so the daily retry scheduler can pick it up.
   */
  private async processChargeback(
    dispute: Dispute,
    originalTx: Transaction,
    adminId: string,
  ): Promise<void> {
    const claimantId = dispute.raisedById;
    const respondentId = originalTx.userId;
    const amount = parseFloat(originalTx.amount);
    const currency = originalTx.currency;

    this.logger.log(
      `Processing chargeback for dispute ${dispute.id}: ` +
        `debit ${respondentId}, credit ${claimantId}, ` +
        `amount ${amount} ${currency}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check respondent balance
      const respondent = await this.usersService.findById(respondentId);
      if (!respondent) throw new NotFoundException('Respondent user not found');

      const respondentBalance = parseFloat(
        (respondent.balances?.[currency] ?? 0).toString(),
      );

      const hasSufficientFunds = respondentBalance >= amount;

      // Build CHARGEBACK transaction record
      const chargebackTx = queryRunner.manager.create(Transaction, {
        userId: respondentId,
        type: 'CHARGEBACK' as unknown as TransactionType, // extend enum at runtime
        amount: amount.toFixed(8),
        currency,
        status: hasSufficientFunds
          ? TransactionStatus.SUCCESS
          : TransactionStatus.PENDING,
        metadata: {
          [CHARGEBACK_META_KEY]: originalTx.id,
          disputeId: dispute.id,
          resolvedByAdminId: adminId,
          pendingFunds: !hasSufficientFunds,
        },
      });

      const savedChargeback = await queryRunner.manager.save(
        Transaction,
        chargebackTx,
      );

      // Record ledger entries only when funds are present
      if (hasSufficientFunds) {
        // Debit respondent (USER DEBIT)
        const debitEntry = queryRunner.manager.create(
          (await import('../ledger/entities/ledger-entry.entity')).LedgerEntry,
          {
            transactionId: savedChargeback.id,
            accountType: (
              await import('../ledger/entities/ledger-entry.entity')
            ).LedgerAccountType.USER,
            direction: (await import('../ledger/entities/ledger-entry.entity'))
              .LedgerDirection.DEBIT,
            amount: amount.toFixed(8),
            currency,
          },
        );
        await queryRunner.manager.save(debitEntry);

        // Credit claimant (USER CREDIT) — uses a separate ledger entry with claimant's userId in metadata
        const creditEntry = queryRunner.manager.create(
          (await import('../ledger/entities/ledger-entry.entity')).LedgerEntry,
          {
            transactionId: savedChargeback.id,
            accountType: (
              await import('../ledger/entities/ledger-entry.entity')
            ).LedgerAccountType.USER,
            direction: (await import('../ledger/entities/ledger-entry.entity'))
              .LedgerDirection.CREDIT,
            amount: amount.toFixed(8),
            currency,
          },
        );
        await queryRunner.manager.save(creditEntry);

        // Update balances in-DB via UsersService (through manager for atomicity)
        const claimant = await this.usersService.findById(claimantId);
        if (!claimant) throw new NotFoundException('Claimant user not found');

        respondent.balances = {
          ...(respondent.balances ?? {}),
          [currency]: respondentBalance - amount,
        };
        const claimantBalance = parseFloat(
          (claimant.balances?.[currency] ?? 0).toString(),
        );
        claimant.balances = {
          ...(claimant.balances ?? {}),
          [currency]: claimantBalance + amount,
        };

        await queryRunner.manager.save(respondent);
        await queryRunner.manager.save(claimant);
      }

      await queryRunner.commitTransaction();

      if (!hasSufficientFunds) {
        this.logger.warn(
          `Chargeback ${savedChargeback.id} marked PENDING_FUNDS – respondent ${respondentId} has insufficient ${currency} balance`,
        );
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Chargeback processing failed for dispute ${dispute.id}: ${msg}`,
      );
      throw new BadRequestException(`Chargeback failed: ${msg}`);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Send in-app notifications to claimant and (if identifiable) respondent.
   */
  private async notifyResolution(
    dispute: Dispute,
    originalTx: Transaction,
    outcome: DisputeOutcome,
  ): Promise<void> {
    const outcomeLabel =
      outcome === DisputeOutcome.VALID
        ? 'resolved as valid'
        : 'resolved with chargeback';

    const claimantMsg = `Your dispute #${dispute.id.slice(0, 8)} has been ${outcomeLabel}.`;
    const respondentMsg = `A dispute you are party to (#${dispute.id.slice(0, 8)}) has been ${outcomeLabel}.`;

    // Notify claimant
    await this.notificationsService
      .create({
        userId: dispute.raisedById,
        type: NotificationType.TRANSACTION,
        title: 'Dispute Resolved',
        message: claimantMsg,
        relatedId: dispute.id,
      })
      .catch((e: unknown) => {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Failed to notify claimant: ${errorMsg}`);
      });

    // Notify respondent (the transaction owner)
    if (originalTx.userId && originalTx.userId !== dispute.raisedById) {
      await this.notificationsService
        .create({
          userId: originalTx.userId,
          type: NotificationType.TRANSACTION,
          title: 'Dispute Resolved',
          message: respondentMsg,
          relatedId: dispute.id,
        })
        .catch((e: unknown) => {
          const errorMsg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Failed to notify respondent: ${errorMsg}`);
        });
    }
  }

  // ── SLA Enforcement ─────────────────────────────────────────────────────────

  @Cron('*/30 * * * *')
  async checkSlaBreaches(): Promise<void> {
    this.logger.log('[Cron] Checking dispute SLA breaches');
    const now = new Date();

    const breachedDisputes = await this.disputeRepo.find({
      where: [
        { status: DisputeStatus.OPEN, isSlaBreached: false, slaDeadline: LessThan(now) },
        { status: DisputeStatus.UNDER_REVIEW, isSlaBreached: false, slaDeadline: LessThan(now) },
      ],
    });

    for (const dispute of breachedDisputes) {
      try {
        dispute.isSlaBreached = true;
        dispute.slaBreachedAt = now;
        dispute.escalationLevel = 1;

        const hoursOverdue = Math.floor((now.getTime() - dispute.slaDeadline!.getTime()) / (1000 * 60 * 60));

        if (hoursOverdue >= 48) {
          dispute.escalationLevel = 3;
          this.logger.error(`CRITICAL: Dispute ${dispute.id} reached SLA escalation level 3 (${hoursOverdue}h overdue) — may trigger regulatory reporting`);
        } else if (hoursOverdue >= 24) {
          dispute.escalationLevel = 2;
          // Notify SUPER_ADMIN
          const superAdmins = await this.userRepository.find({ where: { role: UserRole.SUPER_ADMIN, isActive: true } });
          for (const admin of superAdmins) {
            await this.notificationsService.create({
              userId: admin.id,
              type: NotificationType.TRANSACTION,
              title: 'Dispute SLA Escalation (Level 2)',
              message: `Dispute #${dispute.id.slice(0, 8)} has been open for ${hoursOverdue}h beyond SLA. Escalated to SUPER_ADMIN.`,
              relatedId: dispute.id,
            }).catch(() => {});
          }
        } else {
          // Level 1: assign to most senior admin
          const seniorAdmin = await this.userRepository.findOne({ where: { role: UserRole.ADMIN, isActive: true } });
          if (seniorAdmin) {
            dispute.assignedAdminId = seniorAdmin.id;
            dispute.status = DisputeStatus.UNDER_REVIEW;
          }
        }

        await this.disputeRepo.save(dispute);

        // Notify user
        await this.notificationsService.create({
          userId: dispute.raisedById,
          type: NotificationType.TRANSACTION,
          title: 'Dispute Escalated',
          message: `Your dispute #${dispute.id.slice(0, 8)} has been escalated for priority review (SLA breach).`,
          relatedId: dispute.id,
        }).catch(() => {});

      } catch (err) {
        this.logger.error(`SLA check failed for dispute ${dispute.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async listAllDisputesWithSlaFilter(query: DisputeQueryDto & { slaBreached?: string }): Promise<{ disputes: Dispute[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.disputeRepo.createQueryBuilder('d');
    if (query.status) qb.andWhere('d.status = :status', { status: query.status });
    if (query.reason) qb.andWhere('d.reason = :reason', { reason: query.reason });
    if (query.slaBreached === 'true') qb.andWhere('d.isSlaBreached = :breached', { breached: true });

    const [disputes, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { disputes, total };
  }

  async getSlaStats(): Promise<{
    totalOpen: number;
    slaBreached: number;
    slaBreachedPercent: number;
    avgResolutionDays: number;
    longestOpenDays: number;
  }> {
    const totalOpen = await this.disputeRepo.count({
      where: [{ status: DisputeStatus.OPEN }, { status: DisputeStatus.UNDER_REVIEW }],
    });

    const slaBreached = await this.disputeRepo.count({
      where: [
        { status: DisputeStatus.OPEN, isSlaBreached: true },
        { status: DisputeStatus.UNDER_REVIEW, isSlaBreached: true },
      ],
    });

    const resolvedDisputes = await this.disputeRepo.find({
      where: [{ status: DisputeStatus.RESOLVED_VALID }, { status: DisputeStatus.RESOLVED_CHARGEBACK }],
      select: ['createdAt', 'resolvedAt'],
    });

    let avgResolutionDays = 0;
    if (resolvedDisputes.length > 0) {
      const totalDays = resolvedDisputes.reduce((sum, d) => {
        if (!d.resolvedAt) return sum;
        return sum + (d.resolvedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      }, 0);
      avgResolutionDays = Math.round((totalDays / resolvedDisputes.length) * 10) / 10;
    }

    const oldestOpen = await this.disputeRepo.findOne({
      where: [{ status: DisputeStatus.OPEN }, { status: DisputeStatus.UNDER_REVIEW }],
      order: { createdAt: 'ASC' },
      select: ['createdAt'],
    });

    const longestOpenDays = oldestOpen
      ? Math.floor((Date.now() - oldestOpen.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      totalOpen,
      slaBreached,
      slaBreachedPercent: totalOpen > 0 ? Math.round((slaBreached / totalOpen) * 10000) / 100 : 0,
      avgResolutionDays,
      longestOpenDays,
    };
  }
}
