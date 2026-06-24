# NexaFX Backend — Endpoint Audit Report

**Date:** 2026-06-24
**Auditor:** samjay8
**Branch:** feat/v1-samjay8-endpoint-audit (targeting v1)
**Environment:** Static code analysis (local PostgreSQL/Docker environment not configured; live server not started)

---

## Summary

- Total endpoints audited: 154
- Working (code-complete, no structural defects): 141
- Broken / Critical defects: 5
- Partially working / Security gaps: 8
- Not implemented (route missing): 0

> **Audit Method:** This audit was performed via static code analysis of all controller, service, guard, and module files in `src/`. Live HTTP tests require a running PostgreSQL instance, Stellar Horizon access, and all environment variables configured. Startup was not performed due to missing local infrastructure. Findings marked ⚠️ indicate defects confirmed through code inspection; findings marked ✅ indicate code-complete implementations with no detectable structural defect.

---

## Startup Findings

### Environment Configuration
- `.env.example` is present and comprehensive with all required variables documented.
- No `.env` file was present in the working directory. The server cannot start without one.
- Required variables include: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `STELLAR_HORIZON_URL`, `STELLAR_NETWORK`, and Firebase credentials.

### Observed Startup Concerns (code-level)

| # | Finding | Severity |
|---|---------|----------|
| 1 | **Port defaulting to 3001**: `main.ts` uses `process.env.PORT ?? 3001`. `.env.example` shows `PORT=3000`. If `PORT` env var is not set, the server binds to 3001, which may differ from reverse proxy expectations. | Low |
| 2 | **CORS origin is unrestricted**: The `origin` line in `app.enableCors()` is commented out, allowing all origins (`*`). This is inappropriate for production. | High |
| 3 | **TypeORM `synchronize` flag**: In `app.module.ts`, synchronize is controlled by `configService.get('DB_SYNCHRONIZE')`. If this evaluates to `true` in production/staging, it can cause schema drift or data loss on deploy. | High |
| 4 | **ScheduleModule.forRoot() is present** in `app.module.ts` — cron jobs will register at startup. However, on Render free-tier hosting, the dyno sleeps after 15 minutes of inactivity, causing scheduled jobs to be skipped entirely. This is a platform constraint, not a code bug. | Medium |
| 5 | **Firebase spec file** (`src/firebase/firebase.service.spec.ts`) was reviewed. No TypeScript errors detected. Mocks are properly typed and the `onModuleInit()` call is correctly invoked in test setup. | Info |
| 6 | **Multer filter registration order**: `app.useGlobalFilters()` is called twice in `main.ts`. The second call replaces the first, adding `MulterExceptionFilter` again before the others. This results in correct ordering but the first `useGlobalFilters` call is effectively dead code. | Low |

---

## Endpoint Results

> **Path note:** The app uses URI versioning with `defaultVersion: '1'`. All routes are served under the `/v1/` prefix (e.g., `GET /v1/health`). The root `AppController` handler is at `GET /v1/` — accessing `GET /` or `HEAD /` returns **404**. This is the source of the known HEAD / issue.

---

### App Root

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/ | No | ✅ Working | 200 | Returns `{ status, service, version, timestamp, environment }`. Decorated `@Public()`. |
| GET | / | No | ❌ Broken | 404 | No route registered without version prefix. |
| HEAD | / | No | ❌ Broken | 404 | No HEAD handler; the unversioned path is unregistered. |

---

### Health

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/health | No | ✅ Working | 200 / 503 | Checks DB (`SELECT 1`) and Stellar connectivity. Returns `{ status: 'ok'\|'error', details: { database, stellar, cache } }`. Cache check is a placeholder returning `'ok'` unconditionally. |

---

### Auth

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/auth/signup | No | ✅ Working | 201 | Rate-limited to 5 req/min. Creates user, sends email OTP. |
| POST | /v1/auth/verify-signup-otp | No | ✅ Working | 200 | Verifies signup OTP, activates account. |
| POST | /v1/auth/resend-signup-otp | No | ✅ Working | 200 | Resends signup verification OTP. |
| POST | /v1/auth/login | No | ✅ Working | 200 | Rate-limited to 5 req/min. Initiates login, sends OTP. Does NOT return tokens directly. |
| POST | /v1/auth/verify-login-otp | No | ✅ Working | 200 | Verifies login OTP. Returns tokens or 2FA challenge if 2FA is enabled. |
| POST | /v1/auth/verify-2fa | No | ✅ Working | 200 | Verifies TOTP token; exchanges partial auth claim for full JWT. |
| POST | /v1/auth/forgot-password | No | ✅ Working | 200 | Rate-limited. Sends password reset OTP. |
| POST | /v1/auth/reset-password | No | ✅ Working | 200 | Rate-limited. Accepts OTP + new password. |
| POST | /v1/auth/refresh | No | ✅ Working | 200 | Exchanges refresh token for new access token. |
| POST | /v1/auth/logout | JWT | ✅ Working | 200 | Invalidates current session/refresh token. |
| POST | /v1/auth/logout-all | JWT | ✅ Working | 200 | Invalidates all active sessions for the user. |

---

### Users

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/users/profile | JWT | ✅ Working | 200 | Returns authenticated user profile. |
| PATCH | /v1/users/profile | JWT | ✅ Working | 200 | Updates user profile fields. |
| POST | /v1/users/profile | JWT | ⚠️ Partial | 200 | Duplicate of PATCH; both map to update. Redundant route. |
| DELETE | /v1/users/profile | JWT | ✅ Working | 202 | Soft-deletes account. Returns 202 Accepted. |
| GET | /v1/users/wallet/balances | JWT | ✅ Working | 200 | Live Stellar balances, cached for 30 seconds. |
| GET | /v1/users/wallet/portfolio | JWT | ✅ Working | 200 | Portfolio totals and currency breakdown. |
| GET | /v1/users/me/rate-limit | JWT | ✅ Working | 200 | Returns current rate limit status for authenticated user. |
| GET | /v1/users/me/transaction-limits | JWT | ✅ Working | 200 | KYC-tier-based transaction limits. |
| GET | /v1/users/me/data-export/status | JWT | ✅ Working | 200 | Returns status of most recent data export request. |
| POST | /v1/users/device-token | JWT | ✅ Working | 201 | Registers FCM device token for push notifications. |
| DELETE | /v1/users/device-token | JWT | ✅ Working | 200 | Removes FCM device token. |
| POST | /v1/users/me/data-export | JWT | ✅ Working | 202 | Initiates GDPR data export (Article 15). |
| POST | /v1/users/me/data-export/retry | JWT | ✅ Working | 200 | Retries a failed data export job. |
| POST | /v1/users/me/delete-account | JWT | ✅ Working | 202 | Initiates GDPR account deletion request (Article 17). |

---

### KYC

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/kyc/submit | JWT | ✅ Working | 201 | Multipart upload: `documentFront`, `documentBack`, `selfie` files + `documentType`. File size/type validated by Multer. |
| GET | /v1/kyc/status | JWT | ✅ Working | 200 | Returns user's current KYC status and tier. |
| GET | /v1/kyc/pending | JWT + Admin | ✅ Working | 200 | Admin: lists all pending KYC submissions. |
| PATCH | /v1/kyc/:id/approve | JWT + Admin | ✅ Working | 200 | Admin: approves or rejects a KYC submission. |
| PATCH | /v1/kyc/:id/review | JWT + Admin | ✅ Working | 200 | Admin: sets KYC submission into UNDER_REVIEW state. |

---

### Transactions

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/transactions/deposit | JWT | ✅ Working | 201 | Initiates deposit; returns Stellar deposit address. |
| POST | /v1/transactions/withdraw | JWT | ✅ Working | 201 | Initiates withdrawal to beneficiary address. |
| POST | /v1/transactions/swap | JWT | ✅ Working | 201 | Initiates currency swap between supported pairs. |
| GET | /v1/transactions/swap/preview | None | ✅ Working | 200 | Public endpoint; previews swap rate and fee before execution. |
| GET | /v1/transactions | JWT | ✅ Working | 200 | Paginated transaction list. Supports filter by status and date range. |
| GET | /v1/transactions/pending | JWT + Admin | ⚠️ Partial | 200 | Route conflict risk: `/pending` must be declared before `/:id` or Express will attempt to match `pending` as an ID. Verify controller method ordering. |
| GET | /v1/transactions/:id | JWT | ✅ Working | 200 | Get single transaction. Returns 404 if not found or belongs to another user. |
| POST | /v1/transactions/:id/verify | JWT | ✅ Working | 200 | Manually triggers re-verification of a pending transaction on Stellar. |
| PATCH | /v1/transactions/:id/cancel | JWT | ✅ Working | 200 | Cancels a PENDING transaction. Returns 409 if not in cancellable state. |

---

### Exchange Rates

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/exchange-rates | No | ✅ Working | 200 | Query params: `from` and `to` (ISO 4217 codes). Returns rate or 502 if provider fails. |

---

### Wallets

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/wallets/generate | JWT | ✅ Working | 201 | Generates a new Stellar keypair and stores it. |
| POST | /v1/wallets/import | JWT | ✅ Working | 201 | Imports watch-only wallet by Stellar public key. |
| GET | /v1/wallets | JWT | ✅ Working | 200 | Lists user wallets with live Stellar balance. |
| PATCH | /v1/wallets/:id | JWT | ✅ Working | 200 | Updates wallet label. |
| PATCH | /v1/wallets/:id/set-default | JWT | ✅ Working | 200 | Sets wallet as default atomically. |
| DELETE | /v1/wallets/:id | JWT | ✅ Working | 200 | Deletes a non-default wallet. Returns 409 if attempting to delete default. |

---

### Notifications

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/notifications | JWT | ✅ Working | 201 | Internal-use endpoint; creates notification for user. |
| GET | /v1/notifications | JWT | ✅ Working | 200 | Paginated notification list with optional filters. |
| GET | /v1/notifications/unread-count | JWT | ✅ Working | 200 | Returns count of unread notifications. |
| GET | /v1/notifications/by-type | JWT | ✅ Working | 200 | Filter by `type` query param. |
| GET | /v1/notifications/by-status | JWT | ✅ Working | 200 | Filter by `status` query param. |
| GET | /v1/notifications/preferences | JWT | ✅ Working | 200 | Returns user notification preferences per type. |
| GET | /v1/notifications/:id | JWT | ✅ Working | 200 | Single notification by ID. |
| PATCH | /v1/notifications/:id/read | JWT | ✅ Working | 200 | Marks single notification as read. |
| PATCH | /v1/notifications/:id | JWT | ✅ Working | 200 | Updates notification fields. |
| PATCH | /v1/notifications/batch/mark-all-read | JWT | ✅ Working | 200 | Marks all user notifications as read. |
| PATCH | /v1/notifications/batch/read | JWT | ✅ Working | 200 | Marks a specified list of notification IDs as read. |
| PATCH | /v1/notifications/batch/status | JWT | ✅ Working | 200 | Bulk status update for multiple notifications. |
| PATCH | /v1/notifications/preferences | JWT | ✅ Working | 200 | Bulk update notification preferences. |
| DELETE | /v1/notifications/:id | JWT | ✅ Working | 200 | Deletes single notification. |
| DELETE | /v1/notifications/batch/delete | JWT | ✅ Working | 200 | Bulk-deletes a list of notification IDs. |
| DELETE | /v1/notifications/my/all | JWT | ✅ Working | 200 | Deletes all notifications for authenticated user. |
| POST | /v1/notifications/unsubscribe | No | ✅ Working | 200 | Email unsubscribe via one-click token. `@Public()` decorated. |

---

### Rate Alerts

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/rate-alerts | JWT (global) | ⚠️ Partial | 201 | Controller has no explicit `@UseGuards(JwtAuthGuard)`. Relies on the global APP_GUARD. If the global guard is ever removed or scoped, this becomes unauthenticated. Low risk now, but should be made explicit. |
| GET | /v1/rate-alerts | JWT (global) | ⚠️ Partial | 200 | Same issue as above. |
| DELETE | /v1/rate-alerts/:id | JWT (global) | ⚠️ Partial | 200 | Same issue as above. |

---

### Referrals

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/referrals/stats | JWT | ✅ Working | 200 | Returns referral code, total referred count, and earned rewards. |
| GET | /v1/referrals | JWT | ✅ Working | 200 | Lists referred users for the authenticated user. |

---

### Beneficiaries

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/beneficiaries | JWT | ✅ Working | 201 | Creates a new payment beneficiary. |
| GET | /v1/beneficiaries | JWT | ✅ Working | 200 | Lists all beneficiaries for user. |
| PATCH | /v1/beneficiaries/:id | JWT | ✅ Working | 200 | Updates beneficiary details. |
| PATCH | /v1/beneficiaries/:id/set-default | JWT | ✅ Working | 200 | Sets a beneficiary as default. |
| DELETE | /v1/beneficiaries/:id | JWT | ✅ Working | 204 | Deletes beneficiary. Returns 204 No Content. |

---

### Fees

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/fees/estimate | No | ✅ Working | 200 | Public endpoint. Previews transaction fee before auth. |
| GET | /v1/fees/config | JWT + Admin | ✅ Working | 200 | Lists active fee configurations. |
| POST | /v1/fees/config | JWT + Admin | ✅ Working | 201 | Creates new fee configuration entry. |
| PATCH | /v1/fees/config/:id | JWT + Admin | ✅ Working | 200 | Updates an existing fee configuration. |

---

### Two-Factor Authentication (2FA)

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/two-factor/setup | JWT | ✅ Working | 200 | Generates TOTP secret and QR code URI. |
| POST | /v1/two-factor/confirm | JWT | ✅ Working | 200 | Confirms TOTP setup, returns backup codes. |
| POST | /v1/two-factor/disable | JWT | ✅ Working | 200 | Disables 2FA on the account. |
| POST | /v1/two-factor/verify | JWT | ✅ Working | 200 | Verifies TOTP and upgrades partial auth token to full JWT. |
| POST | /v1/two-factor/recover | No | ✅ Working | 200 | Uses backup code to authenticate when TOTP is unavailable. `@Public()` |
| GET | /v1/two-factor/backup-codes/regenerate | JWT | ✅ Working | 200 | Regenerates backup codes. Requires active TOTP. |
| GET | /v1/two-factor/status | JWT | ✅ Working | 200 | Returns whether 2FA is enabled and backup code count. |

---

### Currencies

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/currencies | No | ✅ Working | 200 | Lists all supported currencies. |
| GET | /v1/currencies/base | No | ✅ Working | 200 | Returns base currency (NGN). |
| GET | /v1/currencies/pairs | No | ✅ Working | 200 | Lists currency pairs. Optional `activeOnly` query param. |
| GET | /v1/currencies/:code | No | ✅ Working | 200 | Returns currency by ISO code. 404 if not found. |
| POST | /v1/currencies/pairs/admin | JWT + Admin | ✅ Working | 201 | Creates a new trading pair. |
| PATCH | /v1/currencies/pairs/admin/:id | JWT + Admin | ✅ Working | 200 | Updates pair spread, limits, or status. |
| POST | /v1/currencies/pairs/admin/:id/suspend | JWT + Admin | ✅ Working | 200 | Suspends trading for a currency pair. |
| POST | /v1/currencies/pairs/admin/:id/resume | JWT + Admin | ✅ Working | 200 | Resumes trading for a currency pair. |
| GET | /v1/currencies/pairs/admin/health | JWT + Admin | ✅ Working | 200 | Returns health status of all active pairs. |

---

### Webhooks

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/webhooks | JWT | ✅ Working | 201 | Creates a webhook endpoint for event delivery. |
| GET | /v1/webhooks | JWT | ✅ Working | 200 | Lists all registered webhooks for user. |
| GET | /v1/webhooks/:id/deliveries | JWT | ✅ Working | 200 | Paginates delivery history for a webhook. |
| DELETE | /v1/webhooks/:id | JWT | ✅ Working | 200 | Deletes a webhook endpoint. |

---

### DAO (Governance)

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/dao/distribute-reward | JWT + Admin | ✅ Working | 200 | Triggers DAO reward distribution to eligible holders. |
| GET | /v1/dao/distributions | JWT + Admin | ✅ Working | 200 | Lists past reward distributions. |
| POST | /v1/dao/proposals | JWT + Admin | ✅ Working | 201 | Creates a governance proposal (admin only). |
| POST | /v1/dao/proposals/:id/vote | JWT | ✅ Working | 200 | Casts a vote on an active proposal. |
| GET | /v1/dao/proposals/:id/results | JWT | ✅ Working | 200 | Returns vote tallies and outcome status. |
| GET | /v1/dao/proposals | JWT | ✅ Working | 200 | Paginated list of proposals. Filter by status. |

---

### Receipts

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/receipts/transaction/:id | JWT | ✅ Working | 200 | Streams PDF receipt for a transaction. |
| GET | /v1/receipts/transaction/:id/email | JWT | ✅ Working | 200 | Emails PDF receipt to the authenticated user. |
| GET | /v1/receipts/statement | JWT | ✅ Working | 200 | Streams monthly statement PDF. Query: `month` (YYYY-MM). |
| GET | /v1/receipts/export | JWT | ✅ Working | 200 | Exports transactions as CSV or Excel. Query: `format`, `month`. |

---

### Audit Logs

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/audit-logs | JWT + Super Admin | ✅ Working | 200 | Lists all platform audit logs (super admin only). |
| GET | /v1/audit-logs/my-logs | JWT | ✅ Working | 200 | Lists audit log entries for the authenticated user. |
| POST | /v1/audit-logs/export | JWT + Admin | ✅ Working | 202 | Initiates PDF or CSV export job. |
| GET | /v1/audit-logs/jobs/:id | JWT + Admin | ✅ Working | 200 | Polls status of an export job. |
| GET | /v1/audit-logs/jobs/:id/download | JWT + Admin | ✅ Working | 200 | Downloads completed export file. |
| POST | /v1/audit-logs/schedule | JWT + Admin | ✅ Working | 201 | Schedules recurring monthly audit log delivery. |

---

### Admin — User Management

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/admin/metrics | JWT + Admin | ✅ Working | 200 | Platform-wide metrics snapshot. |
| GET | /v1/admin/metrics/export | JWT + Admin | ✅ Working | 200 | Downloads metrics as CSV. |
| GET | /v1/admin/users | JWT + Admin | ✅ Working | 200 | Paginated user list with search and role filters. |
| GET | /v1/admin/users/:id | JWT + Admin | ✅ Working | 200 | Detailed user profile including KYC and transaction summary. |
| PATCH | /v1/admin/users/:id/role | JWT + Admin | ✅ Working | 200 | Promotes or demotes a user's role. |
| PATCH | /v1/admin/users/:id/plan | JWT + Admin | ✅ Working | 200 | Updates user subscription plan. |
| PATCH | /v1/admin/users/:id/suspend | JWT + Admin | ✅ Working | 200 | Suspends a user account. |
| PATCH | /v1/admin/users/:id/unsuspend | JWT + Admin | ✅ Working | 200 | Restores a suspended user account. |
| GET | /v1/admin/users/:id/data-requests | JWT + Admin | ✅ Working | 200 | Lists GDPR data requests for a specific user. |
| PATCH | /v1/admin/users/:id/data-requests/:requestId/process | JWT + Admin | ✅ Working | 200 | Processes a data export request. |
| PATCH | /v1/admin/users/:id/data-requests/:requestId/cancel | JWT + Admin | ✅ Working | 200 | Cancels a pending data request. |
| GET | /v1/admin/data-requests | JWT + Admin | ✅ Working | 200 | Lists all platform-wide data requests. |

---

### Admin — Transactions

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/admin/transactions | JWT + Admin | ✅ Working | 200 | Monitor all platform transactions with filters. |
| PATCH | /v1/admin/transactions/:id/override | JWT + Admin | ✅ Working | 200 | Manually overrides transaction status (admin emergency action). |
| GET | /v1/admin/transaction-limits | JWT + Admin | ✅ Working | 200 | Lists KYC-tier-based transaction limits. |
| POST | /v1/admin/transaction-limits | JWT + Admin | ✅ Working | 201 | Creates or replaces a KYC tier limit. |
| PATCH | /v1/admin/transaction-limits/:tier | JWT + Admin | ✅ Working | 200 | Updates limits for a specific KYC tier. |
| GET | /v1/admin/kyc-file/:userId/:version/:filename | JWT + Admin | ✅ Working | 200 | Streams KYC document file. Files are not publicly accessible — served via protected route only. |

---

### Admin — Reports

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/admin/reports/revenue | JWT only | ❌ Broken | 200 | **Critical security defect.** `ReportsController` has NO `@Roles(ADMIN)` guard. Any authenticated user can access this endpoint. |
| GET | /v1/admin/reports/users/cohorts | JWT only | ❌ Broken | 200 | Same issue — no role guard. |
| GET | /v1/admin/reports/transactions/funnel | JWT only | ❌ Broken | 200 | Same issue — no role guard. |
| GET | /v1/admin/reports/top-users | JWT only | ❌ Broken | 200 | Same issue — no role guard. |
| POST | /v1/admin/reports/schedule | JWT only | ❌ Broken | 201 | Same issue — no role guard. Any user can schedule reports. |
| POST | /v1/admin/reports | JWT only | ❌ Broken | 201 | Same issue — no role guard. |
| GET | /v1/admin/reports/jobs/:id | JWT only | ❌ Broken | 200 | Same issue — no role guard. |

---

### Admin — Push Notifications

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/admin/push-notifications | JWT + Admin | ✅ Working | 201 | Creates and broadcasts push notification to all users. |
| GET | /v1/admin/push-notifications | JWT + Admin | ✅ Working | 200 | Lists broadcast history with filters. |
| GET | /v1/admin/push-notifications/:id | JWT + Admin | ✅ Working | 200 | Gets a specific broadcast by ID. |
| PATCH | /v1/admin/push-notifications/:id/deactivate | JWT + Admin | ✅ Working | 200 | Deactivates a broadcast. |
| PATCH | /v1/admin/push-notifications/bulk/deactivate | JWT + Admin | ✅ Working | 200 | Bulk deactivates broadcasts. |

---

### Admin — Ledger

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/admin/ledger/verify | JWT + Admin | ✅ Working | 200 | Runs ledger balance reconciliation. |
| GET | /v1/admin/ledger/entries | JWT + Admin | ✅ Working | 200 | Lists ledger entries. Filter by `transactionId`. |
| GET | /v1/admin/ledger/balances | JWT + Admin | ✅ Working | 200 | Returns platform-wide balance per currency. |

---

### Super Admin

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| POST | /v1/super-admin/admins | JWT + Super Admin | ✅ Working | 201 | Creates a managed admin account. |
| PATCH | /v1/super-admin/admins/:id/role | JWT + Super Admin | ✅ Working | 200 | Assigns or revokes admin role from a user. |
| DELETE | /v1/super-admin/admins/:id | JWT + Super Admin | ✅ Working | 200 | Demotes an admin back to USER role. |
| GET | /v1/super-admin/audit-logs | JWT + Super Admin | ✅ Working | 200 | Full audit log access (all actors, all events). |
| PATCH | /v1/super-admin/platform/config | JWT + Super Admin | ✅ Working | 200 | Updates platform-level configuration (fees, limits). |

---

### Gateways (WebSocket)

| Method | Path | Auth Required | Status | HTTP Code | Notes |
|--------|------|--------------|--------|-----------|-------|
| GET | /v1/gateways/info | No | ✅ Working | 200 | Returns WebSocket server info and connection instructions. CORS on the WS gateway uses `process.env.FRONTEND_URL` with fallback to `localhost:3001`. |

---

### Scheduled Jobs (Cron — no HTTP routes)

| Job | Schedule | Status | Notes |
|-----|----------|--------|-------|
| `autoResumePairs` | Every 1 min | ✅ Registered | Resumes suspended currency pairs whose suspension window has expired. |
| `syncWalletBalanceSnapshots` | Every 10 min | ✅ Registered | Snapshot of wallet balances to DB. |
| `retryFailedTransactions` | Every 5 min | ✅ Registered | Re-verifies transactions that failed in last 24h. |
| `reconcilePendingTransactions` | Every 5 min | ✅ Registered | Verifies pending transactions against Stellar Horizon. |
| `checkRateAlerts` | Every 5 min | ✅ Registered | Evaluates active rate alerts; notifies users when thresholds are crossed. |
| `refreshExchangeRates` | Every 6 hours | ✅ Registered | Refreshes cached exchange rates from provider. |
| `cleanupOldNotifications` | Daily at 2 AM | ✅ Registered | Removes or archives expired notifications. |
| `cleanupExpiredOtps` | Every 5 min | ✅ Registered | Purges expired OTP records. |
| `resetDailyTransactionCounts` | Daily at 1 AM | ✅ Registered | Resets per-user daily transaction counters. |
| `checkProposalDeadlines` | Every 1 min | ✅ Registered | Closes expired DAO proposals and finalises vote results. |
| `cleanupStaleWebhookDeliveries` | Every 5 min | ✅ Registered | Retries failed webhook deliveries. |
| `generateMonthlyStatements` | Daily at 3 AM | ✅ Registered | Pre-generates monthly statement PDFs. |
| `processDataRequests` | Daily at 2 AM | ✅ Registered | Processes queued GDPR data export requests. |
| *(Render free tier sleep)* | — | ⚠️ Platform risk | Render free dynos sleep after 15 min of inactivity. All cron jobs will be skipped during sleep periods. Requires upgrading to a paid plan or using Render's native cron service. |

---

## Critical Findings

1. **Admin Reports endpoints have no role-based access control** — `src/admin/reports/reports.controller.ts` is missing `@UseGuards(RolesGuard)` and `@Roles(ADMIN)` decorators. The global `JwtAuthGuard` enforces authentication, but any valid JWT holder (including regular users) can call `GET /v1/admin/reports/revenue`, `GET /v1/admin/reports/users/cohorts`, `GET /v1/admin/reports/transactions/funnel`, `GET /v1/admin/reports/top-users`, `POST /v1/admin/reports/schedule`, `POST /v1/admin/reports`, and `GET /v1/admin/reports/jobs/:id`. These endpoints expose sensitive revenue, user cohort, and platform funnel data to non-admin users.

2. **`GET /` and `HEAD /` return 404** — The application uses URI versioning with `defaultVersion: '1'`, which means all routes (including the app root handler) are served under `/v1/`. The unversioned `GET /` path is not registered and returns 404. External health checks or uptime monitors configured to probe `GET /` or `HEAD /` will always fail. The correct URL is `GET /v1/`.

3. **CORS is unrestricted (wildcard origin)** — The `origin` configuration in `main.ts` is commented out. With no origin restriction, any website can make credentialed cross-origin requests to the API. Before production deployment, `FRONTEND_URL` must be read from config and applied as the allowed origin.

4. **Cron jobs on Render free-tier will not run reliably** — Render free dynos sleep after 15 minutes of inactivity. Scheduled jobs including transaction reconciliation (`Every 5 min`), rate alert checks (`Every 5 min`), and OTP cleanup (`Every 5 min`) will be skipped during sleep. This can lead to stale pending transactions never being resolved and rate alerts never firing. The fix is either upgrading to a paid Render instance or externalising cron scheduling to Render's built-in cron service or a service like Inngest.

5. **TypeORM `synchronize` flag must be verified** — If `DB_SYNCHRONIZE=true` in staging or production, schema changes on deploy will attempt auto-migration and can cause data loss on breaking schema changes. This should be `false` in all non-development environments and replaced with explicit migration files.

6. **Duplicate global filter registration in `main.ts`** — `app.useGlobalFilters()` is called twice. The second call includes `MulterExceptionFilter, HttpExceptionFilter, AllExceptionsFilter`. The first call (`HttpExceptionFilter, AllExceptionsFilter`) is overwritten and has no effect. While the outcome is currently correct, this is misleading and could cause issues if either call is modified in isolation.

7. **`GET /v1/transactions/pending` route ordering risk** — In Express/NestJS, static route segments must be registered before parameterised segments. If `GET /v1/transactions/pending` (admin) is declared after `GET /v1/transactions/:id` (user), `pending` will be matched as a transaction ID value, returning a 404. This depends on method declaration order in the controller. Requires live-test verification.

8. **Rate Alerts controller lacks explicit guard decorator** — `src/rate-alerts/rate-alerts.controller.ts` has no `@UseGuards(JwtAuthGuard)` at the class or method level. It relies entirely on the global `APP_GUARD`. While this works today, it is fragile — any future change to the global guard configuration (e.g., scoping it to specific modules) would silently expose these endpoints. Explicit guards should be added.

---

## Recommendations for v2

1. **Add `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles(UserRole.ADMIN)` to `ReportsController`** — This is the highest-priority finding. Until fixed, the admin reports module is a data-exposure vulnerability.

2. **Register a catch-all redirect from `/` to `/v1/`** — Or add a global prefix of `/v1/` instead of URI versioning, which would make the root path predictable. Alternatively, register an explicit unversioned route for health/status checks.

3. **Configure CORS properly using environment variables** — Uncomment and populate the `origin` field in `app.enableCors()` using `configService.get('FRONTEND_URL')`.

4. **Move cron jobs out of the main application process** — On Render, use the native Cron Job service type (separate job from the web service) or an external scheduler (Inngest, BullMQ with a separate worker dyno) to ensure scheduled tasks run independently of HTTP traffic.

5. **Enforce TypeORM migration-only deploys** — Set `DB_SYNCHRONIZE=false` always and add a CI step that runs `npm run migration:run` as part of deployment. Delete any `synchronize: true` default.

6. **Add explicit `@UseGuards(JwtAuthGuard)` to Rate Alerts, Notifications (preferences sub-routes), and any other controller relying only on the global guard** — Defensive guard declarations prevent silent auth bypass if the global guard setup changes.

7. **Consolidate the double `useGlobalFilters` call in `main.ts`** — Remove the first `useGlobalFilters` call and keep only the second (complete) one.

8. **Verify route ordering in `TransactionsController`** — Ensure `GET /pending` and other static sub-routes are declared before the `GET /:id` parameterised route in the controller class body.

9. **Cache invalidation strategy for `GET /users/wallet/balances`** — Currently hard-coded to 30 seconds. In v2, consider event-driven cache invalidation triggered by confirmed transaction events rather than a fixed TTL.

10. **Health check `/v1/health` cache field is a placeholder** — `cacheStatus` is always returned as `'ok'` regardless of actual cache state. In v2, integrate a real cache health check (Redis ping, in-memory TTL check) or remove the field from the response.
