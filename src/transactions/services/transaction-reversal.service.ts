import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { TransactionReversal, ReversalStatus } from '../entities/transaction-reversal.entity';
import { ConfirmReversalDto } from '../dtos/reversal.dto';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TransactionReversalService {
  private readonly logger = new Logger(TransactionReversalService.name);
  private readonly maxReversalAgeDays: number;

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(TransactionReversal)
    private readonly reversalRepo: Repository<TransactionReversal>,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.maxReversalAgeDays = this.configService.get<number>('REVERSAL_MAX_AGE_DAYS') ?? 90;
  }

  /** Step 1: Preview reversal — no DB changes to original transaction */
  async previewReversal(transactionId: string, adminId: string): Promise<object> {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (tx.status !== TransactionStatus.SUCCESS) {
      throw new UnprocessableEntityException('Only COMPLETED (SUCCESS) transactions can be reversed');
    }

    const existing = await this.reversalRepo.findOne({ where: { transactionId } });
    if (existing) throw new ConflictException('A reversal already exists for this transaction');

    const ageDays = (Date.now() - tx.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > this.maxReversalAgeDays) {
      throw new UnprocessableEntityException(
        `Cannot reverse transactions older than ${this.maxReversalAgeDays} days`,
      );
    }

    // Create pending reversal record
    const reversal = this.reversalRepo.create({
      transactionId,
      authorisedBy: adminId,
      status: ReversalStatus.PENDING_CONFIRMATION,
      reason: null,
      legalReference: null,
      reversalTransactionId: null,
      completedAt: null,
    });
    await this.reversalRepo.save(reversal);

    return {
      transaction: {
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        userId: tx.userId,
        createdAt: tx.createdAt,
      },
      impact: `Debit recipient, credit sender ${tx.amount} ${tx.currency}`,
      estimatedFee: `0 ${tx.currency}`,
      reversalId: reversal.id,
    };
  }

  /** Step 2: Confirm and execute the reversal */
  async confirmReversal(
    transactionId: string,
    adminId: string,
    dto: ConfirmReversalDto,
  ): Promise<TransactionReversal> {
    const reversal = await this.reversalRepo.findOne({
      where: { transactionId },
      relations: ['transaction'],
    });

    if (!reversal) throw new NotFoundException('No pending reversal found for this transaction');
    if (reversal.status !== ReversalStatus.PENDING_CONFIRMATION) {
      throw new ConflictException('Reversal is not in PENDING_CONFIRMATION status');
    }

    const tx = reversal.transaction;

    // Create compensating transaction
    const compensating = this.txRepo.create({
      userId: tx.userId,
      type: TransactionType.DEPOSIT,
      amount: tx.amount,
      currency: tx.currency,
      status: TransactionStatus.SUCCESS,
      reference: `REVERSAL:${tx.id}`,
      metadata: { reversalOf: tx.id, reason: dto.reason },
    });

    try {
      const saved = await this.txRepo.save(compensating);

      reversal.reversalTransactionId = saved.id;
      reversal.reason = dto.reason;
      reversal.legalReference = dto.legalReference ?? null;
      reversal.status = ReversalStatus.COMPLETED;
      reversal.completedAt = new Date();
      await this.reversalRepo.save(reversal);

      await this.auditLogsService.logSystemEvent(
        'admin.transaction_reversed',
        tx.id,
        { adminId, reason: dto.reason, legalReference: dto.legalReference, reversalId: reversal.id },
      );

      // Notify transaction owner
      await this.notificationsService.dispatch(
        tx.userId,
        NotificationType.TRANSACTION,
        'Transaction Reversed',
        `A transaction of ${tx.amount} ${tx.currency} has been reversed. Reason: ${dto.reason}`,
        { transactionId: tx.id },
      );

      return reversal;
    } catch (err: any) {
      this.logger.error(`Reversal failed for tx ${tx.id}: ${err.message}`);
      reversal.status = ReversalStatus.FAILED;
      await this.reversalRepo.save(reversal);
      throw err;
    }
  }

  /** Get reversal info for a transaction */
  async getReversalInfo(transactionId: string): Promise<TransactionReversal | null> {
    return this.reversalRepo.findOne({ where: { transactionId } });
  }
}
