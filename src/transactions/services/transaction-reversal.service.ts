import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import {
  TransactionReversal,
  ReversalStatus,
} from '../entities/transaction-reversal.entity';
import { ConfirmReversalDto } from '../dtos/reversal.dto';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TransactionReversalService {
  private readonly maxReversalAgeDays: number;
  private readonly confirmationTtlMs: number;

  constructor(
    @InjectRepository(TransactionReversal)
    private readonly reversalRepo: Repository<TransactionReversal>,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.maxReversalAgeDays =
      this.configService.get<number>('REVERSAL_MAX_AGE_DAYS') ?? 90;
    const confirmationTtlMinutes = Number(
      this.configService.get<string | number>(
        'REVERSAL_CONFIRMATION_TTL_MINUTES',
      ) ?? 30,
    );
    if (
      !Number.isFinite(confirmationTtlMinutes) ||
      confirmationTtlMinutes <= 0
    ) {
      throw new Error(
        'REVERSAL_CONFIRMATION_TTL_MINUTES must be a positive number',
      );
    }
    this.confirmationTtlMs = confirmationTtlMinutes * 60 * 1000;
  }

  /** Step 1: Preview reversal — no DB changes to original transaction */
  async previewReversal(
    transactionId: string,
    adminId: string,
  ): Promise<object> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, {
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tx) throw new NotFoundException('Transaction not found');

      if (tx.status !== TransactionStatus.SUCCESS) {
        throw new UnprocessableEntityException(
          'Only COMPLETED (SUCCESS) transactions can be reversed',
        );
      }

      const ageDays =
        (Date.now() - tx.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > this.maxReversalAgeDays) {
        throw new UnprocessableEntityException(
          `Cannot reverse transactions older than ${this.maxReversalAgeDays} days`,
        );
      }

      const existing = await manager.findOne(TransactionReversal, {
        where: { transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing?.status === ReversalStatus.COMPLETED) {
        throw new ConflictException(
          'A reversal already exists for this transaction',
        );
      }

      if (existing) {
        const previewIsStale =
          existing.status === ReversalStatus.PENDING_CONFIRMATION &&
          Date.now() - existing.createdAt.getTime() >= this.confirmationTtlMs;
        const canRetry =
          existing.status === ReversalStatus.FAILED || previewIsStale;

        if (!canRetry) {
          throw new ConflictException(
            'A reversal already exists for this transaction',
          );
        }

        const existingCompensating = await this.findCompensatingTransaction(
          manager,
          tx,
          existing.reversalTransactionId,
        );
        if (existingCompensating) {
          existing.status = ReversalStatus.COMPLETED;
          existing.reversalTransactionId = existingCompensating.id;
          existing.completedAt = existing.completedAt ?? new Date();
          await manager.save(TransactionReversal, existing);
          return { tx, reversal: existing, recovered: true };
        }

        existing.authorisedBy = adminId;
        existing.status = ReversalStatus.PENDING_CONFIRMATION;
        existing.reversalTransactionId = null;
        existing.reason = null;
        existing.legalReference = null;
        existing.completedAt = null;
        existing.createdAt = new Date();
        const reversal = await manager.save(TransactionReversal, existing);
        return { tx, reversal, recovered: false };
      }

      const reversal = manager.create(TransactionReversal, {
        transactionId,
        authorisedBy: adminId,
        status: ReversalStatus.PENDING_CONFIRMATION,
        reason: null,
        legalReference: null,
        reversalTransactionId: null,
        completedAt: null,
      });
      return {
        tx,
        reversal: await manager.save(TransactionReversal, reversal),
        recovered: false,
      };
    });

    if (outcome.recovered) {
      throw new ConflictException(
        'A compensating transaction already exists; the reversal was reconciled as completed',
      );
    }

    return {
      transaction: {
        id: outcome.tx.id,
        type: outcome.tx.type,
        amount: outcome.tx.amount,
        currency: outcome.tx.currency,
        status: outcome.tx.status,
        userId: outcome.tx.userId,
        createdAt: outcome.tx.createdAt,
      },
      impact: `Debit recipient, credit sender ${outcome.tx.amount} ${outcome.tx.currency}`,
      estimatedFee: `0 ${outcome.tx.currency}`,
      reversalId: outcome.reversal.id,
    };
  }

  /** Step 2: Confirm and execute the reversal */
  async confirmReversal(
    transactionId: string,
    adminId: string,
    dto: ConfirmReversalDto,
  ): Promise<TransactionReversal> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, {
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!tx) throw new NotFoundException('Transaction not found');

      const reversal = await manager.findOne(TransactionReversal, {
        where: { transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!reversal) {
        throw new NotFoundException(
          'No pending reversal found for this transaction',
        );
      }
      if (reversal.status !== ReversalStatus.PENDING_CONFIRMATION) {
        throw new ConflictException(
          'Reversal is not in PENDING_CONFIRMATION status',
        );
      }
      if (reversal.authorisedBy === adminId) {
        throw new ForbiddenException(
          'A different administrator must confirm the reversal',
        );
      }
      if (tx.status !== TransactionStatus.SUCCESS) {
        throw new UnprocessableEntityException(
          'Only COMPLETED (SUCCESS) transactions can be reversed',
        );
      }

      const existingCompensating = await this.findCompensatingTransaction(
        manager,
        tx,
        reversal.reversalTransactionId,
      );
      if (existingCompensating) {
        reversal.reversalTransactionId = existingCompensating.id;
        reversal.reason = dto.reason;
        reversal.legalReference = dto.legalReference ?? null;
        reversal.status = ReversalStatus.COMPLETED;
        reversal.completedAt = reversal.completedAt ?? new Date();
        return {
          reversal: await manager.save(TransactionReversal, reversal),
          tx,
          created: false,
        };
      }

      const compensating = manager.create(Transaction, {
        userId: tx.userId,
        type: TransactionType.DEPOSIT,
        amount: tx.amount,
        currency: tx.currency,
        status: TransactionStatus.SUCCESS,
        reference: `REVERSAL:${tx.id}`,
        metadata: { reversalOf: tx.id, reason: dto.reason },
      });
      const saved = await manager.save(Transaction, compensating);

      reversal.reversalTransactionId = saved.id;
      reversal.reason = dto.reason;
      reversal.legalReference = dto.legalReference ?? null;
      reversal.status = ReversalStatus.COMPLETED;
      reversal.completedAt = new Date();
      return {
        reversal: await manager.save(TransactionReversal, reversal),
        tx,
        created: true,
      };
    });

    if (outcome.created) {
      await this.auditLogsService.logSystemEvent(
        'admin.transaction_reversed',
        outcome.tx.id,
        {
          adminId,
          reason: dto.reason,
          legalReference: dto.legalReference,
          reversalId: outcome.reversal.id,
        },
      );

      await this.notificationsService.dispatch(
        outcome.tx.userId,
        NotificationType.TRANSACTION,
        'Transaction Reversed',
        `A transaction of ${outcome.tx.amount} ${outcome.tx.currency} has been reversed. Reason: ${dto.reason}`,
        { transactionId: outcome.tx.id },
      );
    }

    return outcome.reversal;
  }

  /** Get reversal info for a transaction */
  async getReversalInfo(
    transactionId: string,
  ): Promise<TransactionReversal | null> {
    return this.reversalRepo.findOne({ where: { transactionId } });
  }

  private async findCompensatingTransaction(
    manager: EntityManager,
    tx: Transaction,
    reversalTransactionId: string | null,
  ): Promise<Transaction | null> {
    if (reversalTransactionId) {
      const byId = await manager.findOne(Transaction, {
        where: { id: reversalTransactionId },
      });
      if (byId) return byId;
    }

    return manager.findOne(Transaction, {
      where: { reference: `REVERSAL:${tx.id}` },
    });
  }
}
