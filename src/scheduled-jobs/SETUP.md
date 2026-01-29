# Scheduled Jobs Module - Setup Guide

## Installation Status

✅ The Scheduled Jobs Module has been successfully installed and integrated into  NexaFX backend.

## What Was Added

### New Files
1. **`/src/scheduled-jobs/scheduled-jobs.service.ts`** - Core service with all scheduled job logic
2. **`/src/scheduled-jobs/scheduled-jobs.module.ts`** - NestJS module definition
3. **`/src/scheduled-jobs/index.ts`** - Barrel export file for clean imports
4. **`/src/scheduled-jobs/SCHEDULED_JOBS.md`** - Comprehensive documentation
5. **`/src/scheduled-jobs/SETUP.md`** - This setup guide

### Modified Files
1. **`/src/app.module.ts`** - Added ScheduledJobsModule import and Transaction/Notification entities
2. **`/src/users/users.service.ts`** - Added `findOne()` and `update()` methods
3. **`/src/notifications/notifications.service.ts`** - Fixed dependency injection

## Features Implemented

### 1. Pending Transaction Reconciliation (Every 2 Minutes)
- Fetches all transactions with status `PENDING`
- Verifies their status on the Stellar network
- Updates status to `SUCCESS` or `FAILED`
- Updates user balances for successful deposits
- Creates notifications for users

### 2. Failed Transaction Retry (Every 5 Minutes)
- Retries transactions that failed in the last 24 hours
- Re-verifies them on the Stellar network
- Rescues false negatives (transactions that actually succeeded)

### 3. Notification Cleanup (Daily at 2 AM)
- Placeholder for future notification retention policies

### 4. Duplicate Processing Prevention
- Uses in-memory set to prevent processing the same transaction twice
- Safe for distributed deployments (one instance per deployment)

### 5. Comprehensive Logging
- Detailed logs with prefixes for filtering and monitoring
- Error handling with graceful failures

## Required Dependencies

All required dependencies are already in your `package.json`:

- `@nestjs/schedule` (v6.1.0) - For cron job scheduling
- `@nestjs/typeorm` (v11.0.0) - For database access
- `typeorm` (v0.3.20) - ORM

No additional npm packages need to be installed.

## Environment Variables

Ensure these environment variables are set in your `.env` file:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=nexafx

# Stellar Network Configuration
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK=PUBLIC

# Optional Stellar Configuration
STELLAR_BASE_FEE=100

# Node Environment
NODE_ENV=development
```

## Running the Application

The scheduled jobs will automatically start when the application boots:

```bash
# Development
npm run start:dev

# Production
npm run start:prod

# Build only
npm run build
```

## Verification

To verify the module is working correctly:

1. **Check Application Startup**
   ```bash
   npm run start:dev
   ```
   Look for these logs:
   ```
   [Scheduled Job] Starting pending transaction reconciliation
   [Scheduled Job] No pending transactions to reconcile
   [Scheduled Job] Pending transaction reconciliation completed
   ```

2. **Check Database**
   Verify that the `transactions` and `notifications` tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

3. **Monitor Logs**
   Filter logs to monitor job execution:
   ```bash
   # Watch for scheduled job logs
   npm run start:dev | grep "\[Scheduled Job\]"
   ```

## Database Schema

The module uses these existing entities:

### Transactions Table
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL REFERENCES users(id),
  type ENUM ('DEPOSIT', 'WITHDRAW'),
  amount DECIMAL(20, 8),
  currency VARCHAR(10),
  rate DECIMAL(20, 8),
  status ENUM ('PENDING', 'SUCCESS', 'FAILED'),
  txHash VARCHAR(255),
  failureReason TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notifications Table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL REFERENCES users(id),
  type ENUM ('TRANSACTION', 'OTP', 'SYSTEM'),
  title VARCHAR,
  message TEXT,
  status ENUM ('UNREAD', 'READ'),
  metadata JSONB,
  relatedId VARCHAR,
  actionUrl VARCHAR,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  readAt TIMESTAMP
);
```

## API Endpoints (Optional)

While the scheduled jobs run automatically, you can query transactions via existing endpoints:

- `GET /transactions` - List user's transactions
- `GET /transactions/:id` - Get transaction details

## Monitoring & Alerts

### Log Patterns to Monitor

**Normal Operation:**
```
[Scheduled Job] Starting pending transaction reconciliation
[Reconciliation] Processing transaction <id> (hash: <hash>)
[Reconciliation] Transaction <id> verification result: SUCCESS
```

**Issues:**
```
[Scheduled Job] Error reconciling transaction: ...
[Reconciliation] Error updating balance: ...
[Error] Fatal error in pending transaction reconciliation: ...
```

### Important Metrics

Track these metrics for system health:

1. **Reconciliation Time** - How long each job takes
2. **Pending Transactions** - Number waiting for confirmation
3. **Failed Transactions** - Number that failed
4. **Notification Creation** - Confirmations sent to users
5. **Balance Updates** - Successful balance modifications

### Potential Issues & Solutions

| Issue | Solution |
|-------|----------|
| Jobs not running | Check if service started, verify logs |
| Transactions not updating | Verify Stellar API connectivity, check txHash |
| Balance not updating | Check user exists, verify currency, check logs |
| Memory usage increasing | Monitor for stuck transactions, check logs |
| Notifications not created | Verify NotificationsService is available |

## Testing

### Manual Testing

1. **Create a test transaction:**
   ```bash
   # Use your transaction creation endpoint
   POST /transactions/deposit
   Body: { amount: 100, currency: "USD", sourceAddress: "..." }
   ```

2. **Monitor reconciliation:**
   ```bash
   npm run start:dev | grep "Reconciliation"
   ```

3. **Check updates:**
   ```bash
   # Query transaction status
   GET /transactions/{transactionId}
   
   # Check user balance
   GET /users/profile
   
   # Check notifications
   GET /notifications
   ```

### Unit Testing

To add tests for the scheduled jobs service:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { Transaction } from '../transactions/entities/transaction.entity';

describe('ScheduledJobsService', () => {
  let service: ScheduledJobsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledJobsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        // ... mock other dependencies
      ],
    }).compile();

    service = module.get<ScheduledJobsService>(ScheduledJobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add more tests...
});
```

## Configuration Options

### Adjusting Job Frequency

Edit `/src/scheduled-jobs/scheduled-jobs.service.ts`:

```typescript
// Change from EVERY_2_MINUTES to EVERY_5_MINUTES
@Cron(CronExpression.EVERY_5_MINUTES)
async reconcilePendingTransactions(): Promise<void> {
  // ...
}
```

Available cron expressions:
- `EVERY_30_SECONDS`
- `EVERY_MINUTE`
- `EVERY_5_MINUTES`
- `EVERY_10_MINUTES`
- `EVERY_30_MINUTES`
- `EVERY_HOUR`
- `EVERY_DAY_AT_2_AM`
- Custom: `CronExpression.EVERY_MONTH`

### Custom Cron Expression

For custom schedules:

```typescript
@Cron('0 */6 * * *') // Every 6 hours
async myCustomJob() {
  // ...
}
```

## Next Steps

1. ✅ Module is installed and configured
2. ⏭️ Start the application: `npm run start:dev`
3. ⏭️ Create test transactions
4. ⏭️ Monitor logs for reconciliation
5. ⏭️ Verify balance updates and notifications
6. ⏭️ Set up monitoring/alerts for production
7. ⏭️ Adjust cron schedules based on your transaction volume

## Support & Documentation

For detailed information, see:
- `/src/scheduled-jobs/SCHEDULED_JOBS.md` - Full documentation
- `@nestjs/schedule` - [Official Documentation](https://docs.nestjs.com/techniques/task-scheduling)
- Stellar Horizon API - [API Docs](https://developers.stellar.org/api/introduction/)

## Troubleshooting Checklist

- [ ] Environment variables set correctly
- [ ] Database connected and tables created
- [ ] Application starts without errors
- [ ] Logs show scheduled job messages
- [ ] Stellar Horizon API is accessible
- [ ] Transaction table has test data
- [ ] Notifications table is writable
- [ ] User balances are numeric types

## Common Commands

```bash
# Start development server
npm run start:dev

# Build for production
npm run build

# Run tests
npm run test

# Check logs in real-time
npm run start:dev | grep "Scheduled Job"

# Debug mode
npm run start:debug
```

---

✅ **Setup Complete!** Your Scheduled Jobs Module is ready to reconcile transactions and keep your system in sync with the Stellar blockchain.
