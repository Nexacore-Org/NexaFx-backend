import { Injectable, Logger } from '@nestjs/common';
import { TransactionsService } from './transaction.service';
import { UserRole } from '../../users/user.entity';

const SYSTEM_USER_ID = 'system';

/** Upper bound for a single manual verification pass. */
const VERIFICATION_BATCH_SIZE = 100;

interface VerificationSummary {
  total: number;
  verified: number;
  failed: number;
  durationMs: number;
}

@Injectable()
export class TransactionVerificationService {
  private readonly logger = new Logger(TransactionVerificationService.name);

  /**
   * Prevent concurrent cron executions.
   */
  private isRunning = false;

  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * Verifies a bounded batch of pending transactions.
   *
   * This is intentionally NOT scheduled: ScheduledJobsService.reconcilePendingTransactions
   * is the single cron that reconciles PENDING rows and is the only one that
   * honours the processingLockedAt claim. This method is kept for manual use.
   */
  async verifyPendingTransactions(): Promise<VerificationSummary | void> {
    if (this.isRunning) {
      this.logger.warn(
        'Transaction verification skipped because another job is already running.',
      );
      return;
    }

    this.isRunning = true;
    const startedAt = Date.now();

    this.logger.log('Starting automatic transaction verification.');

    try {
      const pendingTransactions =
        await this.transactionsService.getPendingTransactions(
          VERIFICATION_BATCH_SIZE,
        );

      if (pendingTransactions.length === 0) {
        this.logger.log('No pending transactions found.');

        return {
          total: 0,
          verified: 0,
          failed: 0,
          durationMs: Date.now() - startedAt,
        };
      }

      this.logger.log(
        `Found ${pendingTransactions.length} pending transaction(s).`,
      );

      const results = await Promise.allSettled(
        pendingTransactions.map(async (transaction) => {
          await this.transactionsService.verifyTransaction(
            transaction.id,
            SYSTEM_USER_ID,
            UserRole.ADMIN,
            SYSTEM_USER_ID,
          );

          this.logger.debug(`Verified transaction ${transaction.id}`);
        }),
      );

      const verified = results.filter(
        (result) => result.status === 'fulfilled',
      ).length;

      const failedResults = results.flatMap((result, index) =>
        result.status === 'rejected' ? [{ result, index }] : [],
      );

      failedResults.forEach(({ result, index }) => {
        const transactionId = pendingTransactions[index]?.id;

        this.logger.error(
          `Failed to verify transaction ${transactionId}`,
          result.reason instanceof Error
            ? result.reason.stack
            : String(result.reason),
        );
      });

      const summary: VerificationSummary = {
        total: pendingTransactions.length,
        verified,
        failed: failedResults.length,
        durationMs: Date.now() - startedAt,
      };

      this.logger.log(
        `Transaction verification completed. Verified=${summary.verified}, Failed=${summary.failed}, Duration=${summary.durationMs}ms`,
      );

      return summary;
    } catch (error) {
      this.logger.error(
        'Failed to execute transaction verification job.',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger verification of all pending transactions.
   */
  async verifyAllPending(): Promise<VerificationSummary | void> {
    this.logger.log('Manual transaction verification requested.');

    return this.verifyPendingTransactions();
  }
}
