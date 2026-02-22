import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransactionsService } from './transaction.service';
import { UserRole } from 'src/users/user.entity';

const SYSTEM_USER_ID = 'system';

@Injectable()
export class TransactionVerificationService {
  private readonly logger = new Logger(TransactionVerificationService.name);

  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * Automatically verify pending transactions every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async verifyPendingTransactions() {
    this.logger.log('Starting automatic transaction verification');

    try {
      const pendingTransactions =
        await this.transactionsService.getPendingTransactions();

      this.logger.log(
        `Found ${pendingTransactions.length} pending transactions`,
      );

      for (const transaction of pendingTransactions) {
        try {
          await this.transactionsService.verifyTransaction(
            transaction.id,
            SYSTEM_USER_ID,
            UserRole.ADMIN,
            SYSTEM_USER_ID,
          );
          this.logger.log(
            `Verified transaction: ${transaction.id} - Status: ${transaction.status}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to verify transaction ${transaction.id}`,
            error,
          );
        }
      }

      this.logger.log('Completed automatic transaction verification');
    } catch (error) {
      this.logger.error('Failed to verify pending transactions', error);
    }
  }

  /**
   * Manual trigger for transaction verification
   */
  async verifyAllPending() {
    return this.verifyPendingTransactions();
  }
}
