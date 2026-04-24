# API Key Authentication System

## Overview

The API Key Authentication System enables secure service-to-service communication without requiring user JWTs. This is essential for webhook endpoints, external integrations, and automated services.

## Features

- **Cryptographically Secure Keys**: 48-byte (384-bit) random keys using `crypto.randomBytes`
- **SHA-256 Hashing**: Keys are hashed before storage; plaintext is returned only once
- **Prefix-Based Lookup**: First 8 characters stored in plain text for efficient database queries
- **Scoped Permissions**: Granular access control via scope system
- **Key Rotation**: Seamless rotation with configurable grace periods
- **Usage Logging**: Every API key usage is logged with timestamp, endpoint, status, and latency
- **Timing-Safe Comparison**: Prevents timing attacks during key validation

## Quick Start

### 1. Generate an API Key

Use the admin endpoint to create a new API key:

```bash
POST /admin/api-keys
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "name": "Payment Processor Webhook",
  "scopes": ["webhook:receive", "transactions:read"],
  "expiresAt": "2026-12-31T23:59:59Z"  // Optional
}
```

**Response** (plaintext key shown ONCE):

```json
{
  "key": "nxk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Payment Processor Webhook",
  "prefix": "nxk_a1b2",
  "scopes": ["webhook:receive", "transactions:read"],
  "isActive": true,
  "expiresAt": "2026-12-31T23:59:59Z",
  "createdAt": "2026-04-23T10:00:00Z"
}
```

⚠️ **Store the `key` securely - it cannot be retrieved later!**

### 2. Use API Key for Authentication

Include the API key in the `X-API-Key` header:

```bash
POST /webhooks/payment-processor
X-API-Key: nxk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
Content-Type: application/json

{
  "transaction_id": "txn_123",
  "status": "completed"
}
```

### 3. Protect Endpoints with Scopes

```typescript
import { SkipJwtAuth } from './api-keys/decorators/skip-api-key-auth.decorator';
import { UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-keys/guards/api-key.guard';
import { RequireScopes } from './api-keys/decorators/require-scopes.decorator';

@SkipJwtAuth()
@UseGuards(ApiKeyGuard)
@RequireScopes('webhook:receive')
@Post('webhooks/payment-processor')
async handleWebhook(@Body() payload: PaymentWebhookDto) {
  // Process webhook
}
```

## Available Scopes

| Scope | Description |
|-------|-------------|
| `admin:read` | Read admin data |
| `admin:write` | Modify admin data |
| `webhook:receive` | Receive webhook callbacks |
| `transactions:read` | Read transaction data |
| `transactions:write` | Create transactions |
| `rates:read` | Read exchange rates |
| `*:read` | All read operations |
| `*:write` | All write operations |
| `*` | Full access |

### Scope Hierarchy

The system supports wildcard scopes:
- `admin:*` matches `admin:read`, `admin:write`, etc.
- `*` matches all scopes

## API Key Management

### List API Keys

```bash
GET /admin/api-keys?isActive=true&scope=webhook:receive&page=1&limit=20
Authorization: Bearer <admin-jwt-token>
```

### Get API Key Details

```bash
GET /admin/api-keys/:id
Authorization: Bearer <admin-jwt-token>
```

### Revoke API Key

```bash
DELETE /admin/api-keys/:id
Authorization: Bearer <admin-jwt-token>
```

### Rotate API Key

```bash
POST /admin/api-keys/:id/rotate?gracePeriodMinutes=5
Authorization: Bearer <admin-jwt-token>
```

This generates a new key and sets the old key to expire after the grace period (default: 5 minutes).

## Security Best Practices

1. **Store Keys Securely**: Use environment variables or secret management systems (AWS Secrets Manager, HashiCorp Vault)
2. **Use Minimal Scopes**: Apply the principle of least privilege
3. **Set Expiration Dates**: Non-critical keys should have expiration dates
4. **Rotate Regularly**: Rotate keys every 90 days or after suspected compromise
5. **Monitor Usage**: Review audit logs for unusual activity
6. **Never Commit Keys**: Add `*.key` files to `.gitignore`

## Architecture

### Database Schema

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  prefix VARCHAR(8) NOT NULL,
  hashed_key VARCHAR(64) NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at);
```

### Request Flow

```
Client Request (X-API-Key header)
    ↓
ApiKeyGuard (Global Guard)
    ↓
Check @SkipApiKeyAuth() decorator
    ↓
Extract prefix (first 8 chars)
    ↓
Database lookup by prefix
    ↓
SHA-256 hash comparison (timing-safe)
    ↓
Check expiration & active status
    ↓
Validate scopes (@RequireScopes)
    ↓
Attach apiKey to request object
    ↓
Controller Handler
    ↓
ApiKeyUsageInterceptor (logs usage)
```

## Integration Examples

### Webhook Endpoint

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { SkipJwtAuth } from '../api-keys/decorators/skip-api-key-auth.decorator';
import { UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RequireScopes } from '../api-keys/decorators/require-scopes.decorator';

@Controller('webhooks')
export class WebhookController {
  @SkipJwtAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScopes('webhook:receive')
  @Post('stripe')
  async handleStripeWebhook(@Body() payload: any) {
    // Process Stripe webhook
  }
}
```

### Service-to-Service API

```typescript
import { Controller, Get } from '@nestjs/common';
import { SkipJwtAuth } from '../api-keys/decorators/skip-api-key-auth.decorator';
import { UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RequireScopes } from '../api-keys/decorators/require-scopes.decorator';

@Controller('internal')
export class InternalController {
  @SkipJwtAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScopes('transactions:read')
  @Get('transactions')
  async getTransactions() {
    // Return transactions for internal service
  }
}
```

### Access API Key Metadata in Handler

```typescript
import { Request } from 'express';

@SkipJwtAuth()
@UseGuards(ApiKeyGuard)
@RequireScopes('webhook:receive')
@Post('webhooks')
async handleWebhook(@Request() req: Request) {
  const apiKey = req.apiKey; // ApiKeyPayload
  console.log(`Request from: ${apiKey.name}`);
  console.log(`Scopes: ${apiKey.scopes.join(', ')}`);
  
  // Process webhook
}
```

## Error Responses

| Status | Message | Description |
|--------|---------|-------------|
| 401 | `Invalid API key format` | Key is too short or malformed |
| 401 | `Invalid API key` | Key doesn't match any stored key |
| 401 | `API key has expired` | Key has passed its expiration date |
| 401 | `API key has been revoked` | Key was manually revoked |
| 403 | `API key does not have required scope: <scope>` | Key lacks required permission |

## Testing

Run the E2E tests:

```bash
npm run test:e2e -- api-keys.e2e-spec.ts
```

## Audit Logging

All API key actions are logged to the audit system:

- `API_KEY_CREATED`: When a new key is generated
- `API_KEY_REVOKED`: When a key is revoked
- `API_KEY_ROTATED`: When a key is rotated
- `API_KEY_USAGE`: Every authenticated request (endpoint, status, latency)

View audit logs:

```bash
GET /admin/audit-logs?action=API_KEY_USAGE
Authorization: Bearer <admin-jwt-token>
```

## Migration

The API keys table is automatically created by TypeORM's `synchronize: true` setting in development. For production, generate a migration:

```bash
npm run typeorm migration:generate -- -n add-api-keys-table
npm run typeorm migration:run
```

## Troubleshooting

### Issue: "Invalid API key" error
- Verify the key is correctly copied (no extra spaces)
- Check if the key has been revoked
- Ensure the key hasn't expired

### Issue: "API key does not have required scope"
- Verify the key has the required scope assigned
- Check scope spelling and format
- Review wildcard scope matching rules

### Issue: Key not working after rotation
- Old key expires after grace period (default: 5 minutes)
- Update your service to use the new key immediately
- Check rotation timestamp in audit logs
