import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, LessThan, Not, IsNull } from 'typeorm';
import * as os from 'os';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { TransactionsService } from '../transactions/services/transaction.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CurrencyPairService } from '../currencies/services/currency-pair.service';
import {
  NotificationType,
  NotificationStatus,
  Notification,
} from '../notifications/entities/notification.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { RateAlertsService } from '../rate-alerts/rate-alerts.service';
import { WebhookService } from '../webhooks/services/webhook.service';

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private readonly LOCK_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly instanceId: string;
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
    private readonly rateAlertsService: RateAlertsService,
    private readonly webhookService: WebhookService,
    private readonly currencyPairService: CurrencyPairService,
  ) {
    // Truncate hostname to 255 characters to match DB column constraint
    this.instanceId = os.hostname().substring(0, 255);
  }

  /**
   * Auto-resume suspended currency pairs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoResumePairs(): Promise<void> {
    try {
      const resumedCount = await this.currencyPairService.autoResumePairs();
      if (resumedCount > 0) {
        this.logger.log(`[Scheduled Job] Auto-resumed ${resumedCount} currency pairs`);
      }
    } catch (error) {
      this.logger.error('[Scheduled Job] Auto-resume pairs failed:', error);
    }
  }

  /**
   * Sync wallet balance snapshots every 10 minutes
   * Updates the cached balance snapshot from live Stellar data
   */
  @Cron('0 */10 * * * *')
  async syncWalletBalances(): Promise<void> {
    this.logger.log('[Scheduled Job] Starting wallet balance snapshot sync');

    try {
      const result = await this.usersService.syncWalletBalanceSnapshots();
      this.logger.log(
        `[Scheduled Job] Wallet balance sync completed: ${result.updated} synced, ${result.failed} failed out of ${result.processed} processed`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Scheduled Job] Wallet balance sync failed: ${errorMessage}`,
      );
    }
  }

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
      // Atomically claim pending transactions for this instance
      const pendingTransactions = await this.claimPendingTransactions();

      if (pendingTransactions.length === 0) {
        this.logger.log('[Scheduled Job] No pending transactions to reconcile');
        return;
      }

      this.logger.log(
        `[Scheduled Job] Claimed ${pendingTransactions.length} pending transactions`,
      );

      // Process each transaction sequentially
      for (const transaction of pendingTransactions) {
        try {
          await this.reconcileTransaction(transaction);
        } catch (error) {
          this.logger.error(
            `[Scheduled Job] Error reconciling transaction ${transaction.id}:`,
            error,
          );
        } finally {
          // Clear the lock after processing (success or failure)
          await this.clearTransactionLock(transaction.id);
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
        // Try to claim the transaction for retry
        const claimed = await this.claimTransactionForRetry(transaction.id);
        if (!claimed) {
          continue;
        }

        try {
          await this.retryTransaction(transaction);
        } catch (error) {
          this.logger.error(
            `[Scheduled Job] Error retrying transaction ${transaction.id}:`,
            error,
          );
        } finally {
          // Clear the lock after processing (success or failure)
          await this.clearTransactionLock(transaction.id);
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
   * Check user-configured exchange rate alerts every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkRateAlerts(): Promise<void> {
    this.logger.log('[Scheduled Job] Starting rate alert evaluation');

    try {
      const result = await this.rateAlertsService.checkAndTriggerAlerts();
      this.logger.log(
        `[Scheduled Job] Rate alerts checked=${result.checked}, triggered=${result.triggered}, reactivated=${result.reactivated}`,
      );

      // Dispatch webhooks for triggered alerts if needed
      // result.triggeredAlerts.forEach(alert => {
      //   this.webhookService.dispatch('rate_alert.triggered', alert, alert.userId);
      // });
    } catch (error) {
      this.logger.error(
        '[Scheduled Job] Fatal error while checking rate alerts:',
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
   * Sync wallet balances from Stellar into User.balances snapshot every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncWalletBalancesSnapshot(): Promise<void> {
    this.logger.log('[Scheduled Job] Starting wallet balances snapshot sync');

    try {
      const result = await this.usersService.syncWalletBalanceSnapshots();
      this.logger.log(
        `[Scheduled Job] Wallet snapshot sync completed (${result.updated}/${result.processed} users updated)`,
      );
    } catch (error) {
      this.logger.error(
        '[Scheduled Job] Fatal error in wallet balances snapshot sync:',
        error,
      );
    }
  }

  /**
   * Process failed webhook deliveries every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processWebhookRetries(): Promise<void> {
    try {
      await this.webhookService.processRetries();
    } catch (error) {
      this.logger.error('[Scheduled Job] Webhook retry process failed:', error);
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

      const notificationType =
        transaction.type === TransactionType.DEPOSIT
          ? NotificationType.DEPOSIT_CONFIRMED
          : NotificationType.WITHDRAWAL_PROCESSED;

      await this.notificationsService.create({
        userId: transaction.userId,
        type: notificationType,
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

    // Dispatch Webhook
    this.webhookService
      .dispatch('transaction.completed', transaction, transaction.userId)
      .catch((e) => this.logger.error(`Webhook dispatch failed: ${e.message}`));
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
        type: NotificationType.TRANSACTION_FAILED,
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

    // Dispatch Webhook
    this.webhookService
      .dispatch('transaction.failed', transaction, transaction.userId)
      .catch((e) => this.logger.error(`Webhook dispatch failed: ${e.message}`));
  }

  /**
   * Helper method to retry a failed transaction
   */
  private async retryTransaction(transaction: Transaction): Promise<void> {
    this.logger.log(
      `[Retry] Attempting to re-verify failed transaction ${transaction.id}`,
    );

    if (!transaction.txHash) {
      this.logger.warn(`[Retry] Cannot retry transaction ${transaction.id} because it has no hash`);
      return;
    }

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
   * Atomically claim pending transactions for processing by this instance.
   * Uses DB-level UPDATE with WHERE clause to prevent race conditions.
   * Only claims transactions that are:
   * - Status is PENDING
   * - Not currently locked (processingLockedAt IS NULL)
   * - Or lock has expired (processingLockedAt < expiry timestamp)
   */
  private async claimPendingTransactions(): Promise<Transaction[]> {
    const expiryTimestamp = new Date(Date.now() - this.LOCK_EXPIRY_MS);

    // Atomic UPDATE to claim transactions
    const updateResult = await this.transactionRepository
      .createQueryBuilder()
      .update(Transaction)
      .set({
        processingLockedAt: new Date(),
        processingLockedBy: this.instanceId,
      })
      .where(
        'status = :status AND ("processingLockedAt" IS NULL OR "processingLockedAt" < :expiry)',
        {
          status: TransactionStatus.PENDING,
          expiry: expiryTimestamp,
        },
      )
      .execute();

    const claimedCount = updateResult.affected ?? 0;

    if (claimedCount === 0) {
      return [];
    }

    // Fetch only transactions claimed by this instance
    return this.transactionRepository.find({
      where: {
        status: TransactionStatus.PENDING,
        processingLockedBy: this.instanceId,
      },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Clear the processing lock for a transaction after processing.
   */
  private async clearTransactionLock(transactionId: string): Promise<void> {
    await this.transactionRepository.update(transactionId, {
      processingLockedAt: null,
      processingLockedBy: null,
    });
  }

  /**
   * Atomically claim a single transaction for retry by this instance.
   * Returns true if the transaction was successfully claimed.
   */
  private async claimTransactionForRetry(
    transactionId: string,
  ): Promise<boolean> {
    const expiryTimestamp = new Date(Date.now() - this.LOCK_EXPIRY_MS);

    const updateResult = await this.transactionRepository
      .createQueryBuilder()
      .update(Transaction)
      .set({
        processingLockedAt: new Date(),
        processingLockedBy: this.instanceId,
      })
      .where(
        'id = :id AND status = :status AND ("processingLockedAt" IS NULL OR "processingLockedAt" < :expiry)',
        {
          id: transactionId,
          status: TransactionStatus.FAILED,
          expiry: expiryTimestamp,
        },
      )
      .execute();

    return (updateResult.affected ?? 0) > 0;
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
