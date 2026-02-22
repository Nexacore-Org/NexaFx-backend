import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/services/transaction.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import {
  NotificationType,
  NotificationStatus,
  Notification,
} from '../notifications/entities/notification.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private processingTransactionIds = new Set<string>();

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly transactionsService: TransactionsService,
    private readonly stellarService: StellarService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Reconcile pending transactions every 2 minutes
   * Checks Stellar network for transaction status and updates database accordingly
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingTransactions(): Promise<void> {
    this.logger.log(
      '[Scheduled Job] Starting pending transaction reconciliation',
    );

    try {
      // Fetch all pending transactions
      const pendingTransactions = await this.getPendingTransactions();

      if (pendingTransactions.length === 0) {
        this.logger.log('[Scheduled Job] No pending transactions to reconcile');
        return;
      }

      this.logger.log(
        `[Scheduled Job] Found ${pendingTransactions.length} pending transactions`,
      );

      // Process each transaction sequentially to avoid race conditions
      for (const transaction of pendingTransactions) {
        // Skip if already being processed
        if (this.processingTransactionIds.has(transaction.id)) {
          this.logger.debug(
            `[Scheduled Job] Skipping transaction ${transaction.id} - already being processed`,
          );
          continue;
        }

        try {
          this.processingTransactionIds.add(transaction.id);
          await this.reconcileTransaction(transaction);
        } catch (error) {
          this.logger.error(
            `[Scheduled Job] Error reconciling transaction ${transaction.id}:`,
            error,
          );
        } finally {
          this.processingTransactionIds.delete(transaction.id);
        }
      }

      this.logger.log(
        '[Scheduled Job] Pending transaction reconciliation completed',
      );
    } catch (error) {
      this.logger.error(
        '[Scheduled Job] Fatal error in pending transaction reconciliation:',
        error,
      );
    }
  }

  /**
   * Retry failed transactions every 5 minutes
   * Attempts to re-verify failed transactions in case of temporary Stellar network issues
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedTransactions(): Promise<void> {
    this.logger.log('[Scheduled Job] Starting failed transaction retry');

    try {
      // Fetch transactions that failed in the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const failedTransactions = await this.transactionRepository.find({
        where: {
          status: TransactionStatus.FAILED,
        },
        relations: ['user'],
      });

      const recentFailedTxs = failedTransactions.filter(
        (tx) => tx.updatedAt >= twentyFourHoursAgo && tx.txHash,
      );

      if (recentFailedTxs.length === 0) {
        this.logger.log('[Scheduled Job] No failed transactions to retry');
        return;
      }

      this.logger.log(
        `[Scheduled Job] Found ${recentFailedTxs.length} failed transactions to retry`,
      );

      for (const transaction of recentFailedTxs) {
        if (this.processingTransactionIds.has(transaction.id)) {
          continue;
        }

        try {
          this.processingTransactionIds.add(transaction.id);
          await this.retryTransaction(transaction);
        } catch (error) {
          this.logger.error(
            `[Scheduled Job] Error retrying transaction ${transaction.id}:`,
            error,
          );
        } finally {
          this.processingTransactionIds.delete(transaction.id);
        }
      }

      this.logger.log('[Scheduled Job] Failed transaction retry completed');
    } catch (error) {
      this.logger.error(
        '[Scheduled Job] Fatal error in failed transaction retry:',
        error,
      );
    }
  }

  /**
   * Clean up old notifications every day at 2 AM.
   * - READ notifications older than 30 days are deleted.
   * - UNREAD notifications older than 90 days are deleted.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldNotifications(): Promise<void> {
    this.logger.log('[Scheduled Job] Starting old notification cleanup');

    try {
      const now = new Date();

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Delete READ notifications older than 30 days
      const readResult = await this.notificationRepository
        .createQueryBuilder()
        .delete()
        .from(Notification)
        .where('status = :status AND "createdAt" < :cutoff', {
          status: NotificationStatus.READ,
          cutoff: thirtyDaysAgo,
        })
        .execute();

      const readDeleted = readResult.affected ?? 0;
      this.logger.log(
        `[Cleanup] Deleted ${readDeleted} READ notifications older than 30 days`,
      );

      // Delete UNREAD notifications older than 90 days
      const unreadResult = await this.notificationRepository
        .createQueryBuilder()
        .delete()
        .from(Notification)
        .where('status = :status AND "createdAt" < :cutoff', {
          status: NotificationStatus.UNREAD,
          cutoff: ninetyDaysAgo,
        })
        .execute();

      const unreadDeleted = unreadResult.affected ?? 0;
      this.logger.log(
        `[Cleanup] Deleted ${unreadDeleted} UNREAD notifications older than 90 days`,
      );

      this.logger.log(
        `[Scheduled Job] Notification cleanup completed — ${readDeleted + unreadDeleted} total records removed`,
      );
    } catch (error) {
      this.logger.error(
        '[Scheduled Job] Fatal error in notification cleanup:',
        error,
      );
    }
  }

  /**
   * Helper method to reconcile a single transaction
   */
  private async reconcileTransaction(transaction: Transaction): Promise<void> {
    this.logger.log(
      `[Reconciliation] Processing transaction ${transaction.id} (hash: ${transaction.txHash})`,
    );

    if (!transaction.txHash) {
      this.logger.warn(
        `[Reconciliation] Transaction ${transaction.id} has no txHash, cannot verify`,
      );
      return;
    }

    try {
      // Verify transaction on Stellar
      const verificationResult = await this.stellarService.verifyTransaction(
        transaction.txHash,
      );

      this.logger.log(
        `[Reconciliation] Transaction ${transaction.id} verification result: ${verificationResult.status}`,
      );

      if (verificationResult.status === 'SUCCESS') {
        await this.handleSuccessfulTransaction(transaction);
      } else if (verificationResult.status === 'FAILED') {
        await this.handleFailedTransaction(transaction);
      } else {
        // Still pending, do nothing
        this.logger.debug(
          `[Reconciliation] Transaction ${transaction.id} still pending on chain`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[Reconciliation] Error verifying transaction ${transaction.id}:`,
        error,
      );
      // Don't update status, retry next time
    }
  }

  /**
   * Helper method to handle a successfully verified transaction
   */
  private async handleSuccessfulTransaction(
    transaction: Transaction,
  ): Promise<void> {
    this.logger.log(
      `[Reconciliation] Handling successful transaction ${transaction.id}`,
    );

    // Update transaction status
    transaction.status = TransactionStatus.SUCCESS;
    await this.transactionRepository.save(transaction);

    // Update user balance for deposits
    if (transaction.type === TransactionType.DEPOSIT) {
      try {
        await this.updateUserBalance(
          transaction.userId,
          transaction.currency,
          parseFloat(transaction.amount),
        );

        this.logger.log(
          `[Reconciliation] User balance updated for deposit ${transaction.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[Reconciliation] Error updating balance for deposit ${transaction.id}:`,
          error,
        );
      }
    }

    // Create notification for user
    try {
      const notificationMessage =
        transaction.type === TransactionType.DEPOSIT
          ? `Your deposit of ${transaction.amount} ${transaction.currency} has been confirmed`
          : `Your withdrawal of ${transaction.amount} ${transaction.currency} has been confirmed`;

      await this.notificationsService.create({
        userId: transaction.userId,
        type: NotificationType.TRANSACTION,
        title: `${transaction.type} Confirmed`,
        message: notificationMessage,
        relatedId: transaction.id,
        metadata: {
          transactionId: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          txHash: transaction.txHash,
        },
      });

      this.logger.log(
        `[Reconciliation] Notification created for transaction ${transaction.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[Reconciliation] Error creating notification for transaction ${transaction.id}:`,
        error,
      );
    }
  }

  /**
   * Helper method to handle a failed transaction
   */
  private async handleFailedTransaction(
    transaction: Transaction,
  ): Promise<void> {
    this.logger.log(
      `[Reconciliation] Handling failed transaction ${transaction.id}`,
    );

    // Update transaction status
    transaction.status = TransactionStatus.FAILED;
    transaction.failureReason =
      'Transaction failed on blockchain during reconciliation';
    await this.transactionRepository.save(transaction);

    // Refund balance if withdrawal
    if (transaction.type === TransactionType.WITHDRAW) {
      try {
        await this.updateUserBalance(
          transaction.userId,
          transaction.currency,
          parseFloat(transaction.amount),
        );

        this.logger.log(
          `[Reconciliation] User balance refunded for failed withdrawal ${transaction.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[Reconciliation] Error refunding balance for withdrawal ${transaction.id}:`,
          error,
        );
      }
    }

    // Create notification for user about failure
    try {
      const notificationMessage =
        transaction.type === TransactionType.DEPOSIT
          ? `Your deposit of ${transaction.amount} ${transaction.currency} failed`
          : `Your withdrawal of ${transaction.amount} ${transaction.currency} failed`;

      await this.notificationsService.create({
        userId: transaction.userId,
        type: NotificationType.TRANSACTION,
        title: `${transaction.type} Failed`,
        message: notificationMessage,
        relatedId: transaction.id,
        metadata: {
          transactionId: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          failureReason: transaction.failureReason,
        },
      });

      this.logger.log(
        `[Reconciliation] Failure notification created for transaction ${transaction.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[Reconciliation] Error creating failure notification for transaction ${transaction.id}:`,
        error,
      );
    }
  }

  /**
   * Helper method to retry a failed transaction
   */
  private async retryTransaction(transaction: Transaction): Promise<void> {
    this.logger.log(
      `[Retry] Attempting to re-verify failed transaction ${transaction.id}`,
    );

    try {
      const verificationResult = await this.stellarService.verifyTransaction(
        transaction.txHash,
      );

      if (verificationResult.status === 'SUCCESS') {
        this.logger.log(
          `[Retry] Transaction ${transaction.id} was actually successful, updating status`,
        );

        transaction.status = TransactionStatus.SUCCESS;
        await this.transactionRepository.save(transaction);

        // Handle the successful transaction
        await this.handleSuccessfulTransaction(transaction);
      }
    } catch (error) {
      this.logger.error(
        `[Retry] Error retrying transaction ${transaction.id}:`,
        error,
      );
    }
  }

  /**
   * Get all pending transactions
   */
  private async getPendingTransactions(): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { status: TransactionStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Update user balance atomically
   */
  private async updateUserBalance(
    userId: string,
    currency: string,
    amount: number,
  ): Promise<void> {
    this.logger.debug(
      `[Balance Update] Updating balance for user ${userId}: +${amount} ${currency}`,
    );

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Initialize balances if not exists
    if (!user.balances) {
      user.balances = {};
    }

    const currentBalance = parseFloat(
      user.balances[currency]?.toString() || '0',
    );
    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      throw new Error('Insufficient balance for this operation');
    }

    user.balances[currency] = newBalance;

    await this.usersService.update(userId, { balances: user.balances });

    this.logger.debug(
      `[Balance Update] Balance updated for user ${userId}: ${currentBalance} -> ${newBalance} ${currency}`,
    );
  }
}
