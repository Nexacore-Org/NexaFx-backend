# NexaFX Push Notification Deep Links

## Scheme

All deep links use the `nexafx://` custom URI scheme. The mobile app registers this scheme to handle navigation from tapped notifications.

## FCM Data Payload Structure

Every push notification includes a flat `data` block (FCM requires all values to be strings):

| Field | Type | Description |
|-------|------|-------------|
| `notificationId` | string (UUID) | ID of the persisted `Notification` record |
| `type` | string | `NotificationType` enum value |
| `deepLink` | string | `nexafx://` URI to open on tap |
| `actionType` | string | Action identifier (often mirrors `type`) |
| `resourceId` | string | UUID of the related resource (transaction, loan, etc.) |
| `resourceType` | string | Resource category label (`transaction`, `kyc`, `loan`, etc.) |
| `timestamp` | string | ISO 8601 timestamp of when the notification was sent |

## Deep Link Registry

| Notification Type | Deep Link |
|-------------------|-----------|
| `DEPOSIT_CONFIRMED` | `nexafx://transactions/:resourceId` |
| `WITHDRAWAL_PROCESSED` | `nexafx://transactions/:resourceId` |
| `SWAP_COMPLETED` | `nexafx://transactions/:resourceId` |
| `TRANSACTION_FAILED` | `nexafx://transactions/:resourceId` |
| `KYC_APPROVED` | `nexafx://kyc/status` |
| `KYC_REJECTED` | `nexafx://kyc/status` |
| `RATE_ALERT_TRIGGERED` | `nexafx://rates/alerts/:resourceId` |
| `ESCROW_FUNDED` | `nexafx://escrow/:resourceId` |
| `ESCROW_RELEASED` | `nexafx://escrow/:resourceId` |
| `ESCROW_DISPUTED` | `nexafx://escrow/:resourceId` |
| `VAULT_MATURITY` | `nexafx://vaults/:resourceId` |
| `SUPPORT_TICKET_UPDATE` | `nexafx://support/tickets/:resourceId` |
| `SECURITY_ALERT` | `nexafx://security/alerts` |
| `LOAN_REPAYMENT_DUE` | `nexafx://loans/:resourceId` |
| `STAKING_UNLOCK` | `nexafx://staking/:resourceId` |
| `REFERRAL_REWARDED` | `nexafx://referrals` |
| `WALLET_UPDATED` | `nexafx://wallet` |
| *(all others)* | `nexafx://home` |

## Web Fallback

For web contexts where the `nexafx://` scheme cannot be opened, the `actionUrl` field returned by `GET /v2/notifications` contains the same deep link value. Web clients should display a fallback link or redirect to the equivalent web route. WebSocket events include the `actionUrl` in their payload for real-time fallback handling.

## Adding New Deep Links

Add a new entry to `src/notifications/deep-links.registry.ts`:

```typescript
[NotificationType.YOUR_NEW_TYPE]: (ctx) =>
  `nexafx://your-route/${ctx.resourceId ?? ''}`,
```

No other files need to change — `NotificationsService.create()` calls the registry automatically.
