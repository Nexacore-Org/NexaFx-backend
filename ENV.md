# Environment Variables

All environment variables required for the NexaFX authentication system.

## Required Variables

### Database Configuration
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexafx
```

**Important**:
- The application connects via a single `DATABASE_URL` connection string
- Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

### Application
```env
NODE_ENV=development
PORT=3000
```

### JWT Configuration
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRES_IN=15m
```

**Important**: 
- `JWT_SECRET` must be at least 32 characters in production
- `JWT_EXPIRES_IN` format: `15m` (minutes), `1h` (hours), `1d` (days), `900s` (seconds)
- Default: `15m` if not set

### OTP Configuration
```env
OTP_SECRET=your-super-secret-otp-hmac-key-change-in-production-min-32-chars
OTP_EXPIRES_MINUTES=10
```

**Important**:
- `OTP_SECRET` is required for HMAC-based OTP hashing (prevents timing attacks)
- `OTP_EXPIRES_MINUTES` must be between 1-60 (default: 10)

### Refresh Token Configuration
```env
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-hmac-key-change-in-production-min-32-chars
REFRESH_TOKEN_EXPIRES_DAYS=30
```

**Important**:
- `REFRESH_TOKEN_SECRET` is required for HMAC-based token hashing
- `REFRESH_TOKEN_EXPIRES_DAYS` must be between 1-90 (default: 30)

### Queue Dashboard Configuration
```env
QUEUE_DASHBOARD_USER=admin
QUEUE_DASHBOARD_PASSWORD=change-me-in-production
```

**Important**:
- The Bull Board queue dashboard is protected by HTTP Basic Auth
- Both `QUEUE_DASHBOARD_USER` and `QUEUE_DASHBOARD_PASSWORD` must be set to enable the dashboard
- If either is unset, the dashboard is disabled entirely (fail-closed)

## Production Requirements

In production (`NODE_ENV=production`), the following variables **MUST** be set or the application will fail to start:
- `JWT_SECRET`
- `OTP_SECRET`
- `REFRESH_TOKEN_SECRET`

All secrets should be:
- At least 32 characters long
- Cryptographically random
- Stored securely (use secrets management service)
- Never committed to version control

## Example .env file

Create a `.env` file in the root directory:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexafx

NODE_ENV=development
PORT=3000

JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRES_IN=15m

OTP_SECRET=your-super-secret-otp-hmac-key-change-in-production-min-32-chars
OTP_EXPIRES_MINUTES=10

REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-hmac-key-change-in-production-min-32-chars
REFRESH_TOKEN_EXPIRES_DAYS=30

QUEUE_DASHBOARD_USER=admin
QUEUE_DASHBOARD_PASSWORD=change-me-in-production
```
