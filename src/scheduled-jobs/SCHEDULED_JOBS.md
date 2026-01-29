# Scheduled Jobs Module

The Scheduled Jobs Module is responsible for periodically reconciling pending transactions with the Stellar blockchain network. This ensures that the system maintains eventual consistency between the database and the blockchain state.

## Overview

This module provides automatic background tasks that run on a predefined schedule to:

1. **Reconcile Pending Transactions** (Every 2 minutes)
   - Fetch all pending transactions from the database
   - Verify their status on the Stellar network using transaction hashes
   - Update transaction status (PENDING → SUCCESS or FAILED)
   - Update user balances for successful deposits
   - Create notifications for transaction confirmations/failures

2. **Retry Failed Transactions** (Every 5 minutes)
   - Fetch transactions that failed in the last 24 hours
   - Attempt to re-verify them on the Stellar network
   - Update status if they were actually successful (rescue false negatives)

3. **Cleanup Old Notifications** (Daily at 2 AM)
   - Remove or archive old notifications based on retention policy

## Architecture

### Key Components

#### `ScheduledJobsService`
Contains all scheduled job logic and helper methods:

- `reconcilePendingTransactions()` - Main job that verifies pending transactions
- `retryFailedTransactions()` - Retries previously failed transactions
- `cleanupOldNotifications()` - Cleans up old notification data
- `reconcileTransaction()` - Reconciles a single transaction
- `handleSuccessfulTransaction()` - Handles successful transaction logic
- `handleFailedTransaction()` - Handles failed transaction logic
- `updateUserBalance()` - Atomically updates user balance

#### `ScheduledJobsModule`
Provides:
- Service providers
- TypeORM entities
- Dependency injections
- Export statements for other modules

### Data Flow

```
[Scheduled Cron Job]
        ↓
[Fetch Pending Transactions]
        ↓
[Verify on Stellar Horizon]
        ↓
    ┌───┴───┐
    ↓       ↓
 SUCCESS   FAILED
    ↓       ↓
[Update   [Update
 Balance]  Status]
    ↓       ↓
[Create Notification]
    ↓
[Save to Database]
```

## Configuration

### Environment Variables

The following environment variables should be set:

```env
# Stellar Network Configuration
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK=PUBLIC

# Optional
STELLAR_BASE_FEE=100
```

### Cron Schedule

The module uses NestJS Schedule with the following cron expressions:

- `EVERY_2_MINUTES` - Pending transaction reconciliation
- `EVERY_5_MINUTES` - Failed transaction retry
- `EVERY_DAY_AT_2_AM` - Daily cleanup tasks

You can adjust these by modifying the `@Cron()` decorators in `scheduled-jobs.service.ts`.

## Features

### 1. Duplicate Processing Prevention

The service maintains an in-memory set of transaction IDs currently being processed to prevent duplicate processing:

```typescript
private processingTransactionIds = new Set<string>();
```

This ensures that long-running verifications don't cause conflicts.

### 2. Graceful Error Handling

All operations are wrapped in try-catch blocks with detailed logging:

- Network failures don't crash the job
- Individual transaction failures don't stop the entire batch
- Errors are logged with context for debugging

### 3. Atomic Balance Updates

Balance updates are atomic and include validation:

```typescript
private async updateUserBalance(
  userId: string,
  currency: string,
  amount: number,
): Promise<void>
```

### 4. Comprehensive Logging

Each operation is logged with a `[Scheduled Job]` or `[Reconciliation]` prefix for easy filtering:

```
[Scheduled Job] Starting pending transaction reconciliation
[Reconciliation] Processing transaction <id> (hash: <hash>)
[Reconciliation] User balance updated for deposit <id>
```

### 5. User Notifications

Automatic notifications are created for:
- Successful deposits: "Your deposit of X CURRENCY has been confirmed"
- Successful withdrawals: "Your withdrawal of X CURRENCY has been confirmed"
- Failed deposits: "Your deposit of X CURRENCY failed"
- Failed withdrawals: "Your withdrawal of X CURRENCY failed"

## Integration Points

### Dependencies

1. **TransactionsService**
   - Provides transaction verification methods
   - Used by other parts of the application

2. **StellarService**
   - Verifies transactions on the Stellar network
   - Provides blockchain integration

3. **NotificationsService**
   - Creates user notifications
   - Manages notification status and delivery

4. **UsersService**
   - Updates user balances
   - Retrieves user information

## How to Use

### Starting the Service

The module is automatically initialized when the application starts:

```typescript
// In app.module.ts
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';

@Module({
  imports: [
    // ... other imports
    ScheduledJobsModule,
  ],
})
export class AppModule {}
```

### Accessing the Service

Inject the service into other modules if needed:

```typescript
constructor(private scheduledJobsService: ScheduledJobsService) {}
```

### Manual Execution (Optional)

You can manually trigger reconciliation:

```typescript
await this.scheduledJobsService.reconcilePendingTransactions();
await this.scheduledJobsService.retryFailedTransactions();
```

## Monitoring and Debugging

### Logs

Enable debug logs in development to monitor job execution:

```env
NODE_ENV=development
```

Look for logs with these prefixes:
- `[Scheduled Job]` - Job start/completion
- `[Reconciliation]` - Transaction processing
- `[Retry]` - Retry operations
- `[Balance Update]` - Balance changes

### Database Queries

To check pending transactions:

```sql
SELECT id, userId, type, amount, currency, status, txHash, createdAt
FROM transactions
WHERE status = 'PENDING'
ORDER BY createdAt ASC;
```

To check recent failed transactions:

```sql
SELECT id, userId, type, amount, currency, status, failureReason, updatedAt
FROM transactions
WHERE status = 'FAILED'
  AND updatedAt > NOW() - INTERVAL '24 hours'
ORDER BY updatedAt DESC;
```

## Performance Considerations

### 1. Query Optimization

Transactions are fetched with:
- Single database query (batched)
- Proper indexing on status and createdAt columns
- Relations eager-loaded

### 2. Rate Limiting

The Stellar Horizon API has rate limits. Current schedule (2-5 minute intervals) is conservative:
- 2-minute interval = 720 requests/day per transaction type
- Safe for most deployments

### 3. Timeout Handling

Each operation has proper timeout handling:
- Stellar API calls timeout after 180 seconds
- Database operations use connection pool
- No memory leaks from hanging promises

## Troubleshooting

### Issue: Transactions not being reconciled

1. Check if the service is running: Look for `[Scheduled Job]` logs
2. Verify environment variables are set
3. Ensure database connectivity
4. Check Stellar Horizon API availability

### Issue: Balance not updating

1. Verify user record exists in database
2. Check transaction currency matches user's supported currencies
3. Ensure sufficient disk space for database

### Issue: High CPU/Memory usage

1. Reduce cron frequency temporarily
2. Check for stuck transactions (txHash = null)
3. Review logs for infinite loops

## Future Enhancements

1. **Webhook Notifications**: Add Stellar webhook support for real-time updates
2. **Batch Processing**: Group verifications for better performance
3. **Dead Letter Queue**: Handle permanently failed transactions
4. **Metrics**: Add Prometheus metrics for job execution times
5. **Configurable Schedules**: Allow schedule adjustment via environment variables
6. **Transaction Pagination**: Handle large numbers of pending transactions

## Security

- All database operations use parameterized queries (TypeORM)
- No sensitive data is logged
- Balance updates are validated to prevent negative balances
- Transaction verification uses public Stellar Horizon API
