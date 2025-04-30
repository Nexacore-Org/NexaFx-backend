// **src/transactions/transactions.service.ts** (partial)


import { Injectable } from '@nestjs/common';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityType } from '../activity-logs/constants/activity-types.enum';

@Injectable()
export class TransactionsService {
  constructor(
    // ... other dependencies
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async createTransaction(userId: string, transactionData: any): Promise<any> {
    // Existing transaction creation logic
    const transaction = await this.transactionRepository.save(transactionData);
    
    // Log the transaction creation, excluding sensitive data
    await this.activityLogsService.logActivity(
      userId,
      ActivityType.TRANSACTION_CREATED,
      { 
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        // Note: Not logging payment details or other sensitive information
      },
    );
    
    return transaction;
  }

  async completeTransaction(userId: string, transactionId: string): Promise<any> {
    // Existing transaction completion logic
    const transaction = await this.transactionRepository.findOne(transactionId);
    transaction.status = 'COMPLETED';
    await this.transactionRepository.save(transaction);
    
    // Log the transaction completion
    await this.activityLogsService.logActivity(
      userId,
      ActivityType.TRANSACTION_COMPLETED,
      { 
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
      },
    );
    
    return transaction;
  }
}