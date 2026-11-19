# NexaFX Backend v2

<div align="center">

![CI/CD](https://github.com/Nexacore-Org/NexaFx-backend/actions/workflows/ci.yml/badge.svg)
![Coverage](https://img.shields.io/codecov/c/github/Nexacore-Org/NexaFx-backend)
![License](https://img.shields.io/github/license/Nexacore-Org/NexaFx-backend)
![Node Version](https://img.shields.io/node/v/@nestjs/core)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

</div>

**NexaFX** is a Web3-powered currency exchange platform that supports real-time fiat and crypto conversions. The backend is built using **NestJS** and interfaces with smart contracts written in **Rust** on the **Stellar network**.

---

## 🏗️ Architecture Diagram

```mermaid
flowchart TD
    subgraph Client
        Web[Web App]
        Mobile[Mobile App]
        API[API Consumers]
    end

    subgraph Backend
        Gateway[API Gateway]
        Auth[Auth Module]
        Users[Users Module]
        Currencies[Currencies Module]
        Transactions[Transactions Module]
        ExchangeRates[Exchange Rates Module]
        Admin[Admin Module]
        Notifications[Notifications Module]
    end

    subgraph Data Stores
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis)]
        InMemoryCache[(In-Memory Cache)]
    end

    subgraph External
        Stellar[Stellar Network]
        Mailgun[Mailgun]
        Firebase[Firebase]
        RateProvider[Exchange Rate Provider]
    end

    Web --> Gateway
    Mobile --> Gateway
    API --> Gateway
    
    Gateway --> Auth
    Gateway --> Users
    Gateway --> Currencies
    Gateway --> Transactions
    Gateway --> ExchangeRates
    Gateway --> Admin
    Gateway --> Notifications
    
    Gateway -->|rate limiting| Redis
    Auth --> PostgreSQL
    Auth -->|revoked tokens| Redis
    Users --> PostgreSQL
    Currencies --> PostgreSQL
    Transactions --> PostgreSQL
    Transactions -->|idempotency and queues| Redis
    ExchangeRates -->|process-local cache| InMemoryCache
    ExchangeRates -->|shared cache| Redis
    Notifications --> PostgreSQL
    
    Transactions --> Stellar
    Notifications --> Mailgun
    Notifications --> Firebase
    ExchangeRates --> RateProvider
```


## 🚀 Features

- JWT-based authentication and authorization
- Role-based access control (Admin, User, Tutor)
- Multi-currency exchange system
- Blockchain integration with Stellar smart contracts
- Real-time and historical transactions tracking
- Modular, scalable NestJS architecture
- Exportable transaction data (CSV, Excel, PDF)

---

## 🏗️ Project Structure

```
nexafx-backend/
├── src/
│   ├── __mocks__/                 # Jest module mocks
│   ├── admin/                     # Admin APIs and impersonation
│   ├── analytics/                 # Usage and platform analytics
│   ├── audit-logs/                # Audit trail and logging
│   ├── auth/                      # Authentication and authorization
│   ├── beneficiaries/             # Beneficiary management
│   ├── blockchain/                # Stellar blockchain integration
│   ├── cards/                     # Card issuance and management
│   ├── common/                    # Shared guards, interceptors and services
│   ├── currencies/                # Currency registry and pairs
│   ├── custom-reports/            # Custom report generation
│   ├── dao/                       # Governance proposals and voting
│   ├── database/                  # Data source configuration and seeds
│   ├── escrow/                    # Escrow accounts and workflows
│   ├── exchange-rates/            # Rate providers and comparison
│   ├── fees/                      # Fee calculation and matrices
│   ├── financial-health/          # Financial health reporting
│   ├── firebase/                  # Firebase integration
│   ├── gateways/                  # Socket.IO gateways
│   ├── graphql/                   # GraphQL API
│   ├── health/                    # Health check endpoints
│   ├── i18n/                      # Translation files
│   ├── intelligent-sms-routing/   # SMS routing rules
│   ├── kyc/                       # KYC document and verification workflows
│   ├── ledger/                    # Ledger entries and reconciliation
│   ├── migrations/                # TypeORM migrations
│   ├── modules/
│   │   ├── auth/                  # Auth helpers
│   │   ├── compliance/            # AML, SAR and compliance flags
│   │   ├── expenses/              # Expense entities
│   │   ├── flags/                 # Feature flags
│   │   ├── gdpr/                  # Consent and erasure workflows
│   │   ├── mail/                  # Mail queue processing
│   │   ├── micro-savings/         # Savings rules and contributions
│   │   ├── queues/                # BullMQ setup and dashboard
│   │   ├── redis/                 # Redis client and throttler storage
│   │   ├── stellar/               # Stellar service wrapper
│   │   ├── storage/               # Local and S3 storage
│   │   └── webhooks/              # Webhook payload schemas
│   ├── notifications/             # Email and in-app notifications
│   ├── otps/                      # One-time passwords
│   ├── portfolio/                 # Portfolio reporting
│   ├── push-notifications/        # Firebase push notifications
│   ├── qr/                        # QR code generation
│   ├── rate-alerts/               # Rate threshold alerts
│   ├── receipts/                  # Receipt generation and export
│   ├── referrals/                 # Referral tracking and rewards
│   ├── sanctions/                 # Sanctions screening
│   ├── scheduled-jobs/            # Scheduled background tasks
│   ├── super-admin/               # Managed admins and platform controls
│   ├── tax/                       # Tax calculation and reporting
│   ├── tokens/                    # Refresh token helpers
│   ├── transactions/              # Transaction processing and tracking
│   ├── two-factor/                # TOTP-based 2FA
│   ├── unified-activity-feed/     # Aggregated activity feed
│   ├── users/                     # User management
│   ├── vaults/                    # Savings vaults
│   ├── wallets/                   # Wallet management
│   ├── webhooks/                  # Webhook endpoints and deliveries
│   ├── app.module.ts              # Root application module
│   ├── app.controller.ts          # Root application controller
│   ├── app.service.ts             # Root application service
│   └── main.ts                    # Application entry point
├── scripts/                       # Setup and maintenance scripts
├── test/                          # E2E and integration tests
├── .env.example                   # Environment configuration template
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

---

## 📦 Tech Stack

- **Backend Framework**: NestJS 11, TypeScript 5.9
- **Database ORM**: TypeORM 0.3 (PostgreSQL)
- **Authentication**: JWT (Passport.js), Bcrypt, TOTP
- **Blockchain**: Stellar SDK with Horizon API integration
- **Background Jobs**: NestJS Schedule (@nestjs/schedule)
- **Notifications**: Mailgun (email), Firebase (push notifications)
- **Rate Limiting**: NestJS Throttler
- **Documentation**: Swagger/OpenAPI decorators (Swagger UI is not mounted yet)
- **Testing**: Jest, Supertest
- **Code Quality**: ESLint, Prettier

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20+ (LTS recommended)
- **Docker & Docker Compose**: For running PostgreSQL and Redis
- **npm**: v9+ (comes with Node.js)
- **Git**: For version control

### Quick Start (Automated)

The fastest way to get started is using our automated setup script:

```bash
# Clone the repository
git clone https://github.com/Nexacore-Org/NexaFx-backend.git
cd NexaFx-backend

# Run the setup script (does everything for you!)
./scripts/setup-dev.sh

# Start the application
npm run start:dev
```

### Manual Setup

If you prefer to set up manually:

#### 1. Clone the Repository

```bash
git clone https://github.com/Nexacore-Org/NexaFx-backend.git
cd NexaFx-backend
```

#### 2. Install Dependencies

```bash
npm ci
```

#### 3. Setup Environment Variables

Copy the `.env.example` file and create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and configure your variables (see [Environment Variables](#-environment-variables) section below).

#### 4. Start PostgreSQL and Redis with Docker

```bash
docker-compose up -d
```

#### 5. Run Database Migrations

```bash
npm run typeorm:migration:run
```

#### 6. Start the Application

```bash
npm run start:dev
```

---

### Development Workflow

- **Health Check**: `http://localhost:3000/health`
- **Run Tests**: `npm run test`
- **Run Lint**: `npm run lint`
- **Format Code**: `npm run format`




---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

### Database Configuration
| Variable | Type | Required | Example | Description |
|----------|------|----------|---------|-------------|
| `DATABASE_URL` | string | ✅ Yes | `postgresql://postgres:postgres@localhost:5432/nexafx` | PostgreSQL connection string |
| `DB_HOST` | string | ✅ Yes | `localhost` | Database host address |
| `DB_PORT` | number | ✅ Yes | `5432` | Database port |
| `DB_USERNAME` | string | ✅ Yes | `postgres` | Database user |
| `DB_PASSWORD` | string | ✅ Yes | `postgres` | Database password |
| `DB_NAME` | string | ✅ Yes | `nexafx` | Database name |
| `REDIS_URL` | string | ✅ Yes | `redis://localhost:6379` | Redis connection string |

### Application Configuration
| Variable | Type | Required | Example | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | string | ✅ Yes | `development` | Runtime environment: `development`, `staging`, `production` |
| `PORT` | number | ✅ Yes | `3000` | Server port |

### JWT & Authentication
| Variable | Type | Required | Min Length | Description |
|----------|------|----------|-----------|-------------|
| `JWT_SECRET` | string | ✅ Yes | 32 chars | Secret key for signing JWT tokens (keep secure in production) |
| `JWT_EXPIRES_IN` | string | ✅ Yes | N/A | JWT expiration time (e.g., `15m`, `1h`, `7d`) |
| `REFRESH_TOKEN_SECRET` | string | ✅ Yes | 32 chars | Secret for refresh token signing |
| `REFRESH_TOKEN_EXPIRES_DAYS` | number | ✅ Yes | N/A | Refresh token lifespan in days (default: 30) |

### OTP & Two-Factor Authentication
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `OTP_SECRET` | string | ✅ Yes | HMAC secret for TOTP generation (min 32 chars) |
| `OTP_EXPIRES_MINUTES` | number | ✅ Yes | OTP validity period in minutes (default: 10) |

### Stellar Blockchain
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `STELLAR_NETWORK` | string | ✅ Yes | Network: `TESTNET` or `PUBLIC` |
| `STELLAR_HORIZON_URL` | string | ✅ Yes | Horizon API endpoint (testnet: `https://horizon-testnet.stellar.org`) |
| `STELLAR_BASE_FEE` | number | ✅ Yes | Base transaction fee in stroops (typically 100) |
| `STELLAR_HOT_WALLET_SECRET` | string | ✅ Yes | Secret key for Stellar hot wallet (keep secure!) |

### Wallet Encryption
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `WALLET_ENCRYPTION_KEY` | string | ✅ Yes | 64-character hex key for wallet encryption. Generate: `openssl rand -hex 32` |

### Email Service (Mailgun)
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `MAILGUN_API_KEY` | string | ✅ Yes | Mailgun API key from dashboard |
| `MAILGUN_DOMAIN` | string | ✅ Yes | Verified Mailgun domain (e.g., `mail.nexafx.com`) |
| `MAILGUN_FROM_EMAIL` | string | ✅ Yes | Sender email address (e.g., `noreply@nexafx.com`) |
| `MAILGUN_FROM_NAME` | string | ❌ No | Display name for emails (default: `NexaFX`) |
| `SKIP_EMAIL_SENDING` | boolean | ❌ No | Skip email sending in development (default: `false`) |

### Frontend Configuration
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `FRONTEND_URL` | string | ✅ Yes | Frontend URL for CORS and email links (e.g., `http://localhost:3001`) |

### Rate Limiting
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `THROTTLE_TTL` | number | ✅ Yes | Time window in seconds (default: 60) |
| `THROTTLE_LIMIT` | number | ✅ Yes | Max requests per window (default: 100) |
| `THROTTLE_AUTH_LIMIT` | number | ✅ Yes | Max auth attempts per window (default: 5) |

### Exchange Rates Provider
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `EXCHANGE_RATES_PROVIDER_BASE_URL` | string | ✅ Yes | CoinGecko API base URL (default: `https://api.coingecko.com/api/v3`) |
| `EXCHANGE_RATES_PROVIDER_API_KEY` | string | ❌ No | Optional CoinGecko Demo API key, sent in the `x-cg-demo-api-key` header |
| `EXCHANGE_RATES_PROVIDER_TIMEOUT_MS` | number | ✅ Yes | Request timeout in milliseconds (default: 5000) |
| `EXCHANGE_RATES_CACHE_TTL_SECONDS` | number | ✅ Yes | Cache duration in seconds (default: 600 = 10 min) |
| `EXCHANGE_RATES_CACHE_MAX_SIZE` | number | ✅ Yes | Max cached rates (default: 1000) |

---

---

## 🧪 Running Tests

```bash
# Unit & Integration
npm run test

# E2E
npm run test:e2e

# Coverage
npm run test:cov
```

---

## 🔐 Role-Based Access Control

The application implements role-based access control (RBAC) with the following roles:

- **USER**: Can perform standard exchange operations, manage own profile, view transactions
- **ADMIN**: Full control of all resources, user management, configuration, audit logs
- **SUPER_ADMIN**: System-level administrative access — manages managed admins, platform configuration, and elevated role assignments via `src/super-admin/`

Guards are applied at controller and route levels using custom decorators (`@RequireRole()`, `@Permissions()`) and NestJS Guards.

---

## 📁 Module Overview

The tables reflect the directories that currently exist under `src/` and `src/modules/`. They describe the code in the tree; no completion status is implied.

### `src/`

| Directory | Contents |
|-----------|----------|
| `src/__mocks__/` | Jest mocks |
| `src/admin/` | Admin APIs, reports and impersonation |
| `src/analytics/` | Platform analytics and reporting |
| `src/audit-logs/` | Audit trail capture and queries |
| `src/auth/` | Authentication, JWT and OAuth strategies |
| `src/beneficiaries/` | Recipient and payout details |
| `src/blockchain/` | Stellar SDK integration |
| `src/cards/` | Card issuance and management |
| `src/common/` | Shared guards, interceptors, pipes and services |
| `src/currencies/` | Currency registry and pairs |
| `src/custom-reports/` | User-defined reports |
| `src/dao/` | Governance proposals and voting |
| `src/database/` | Data source configuration and seeds |
| `src/escrow/` | Escrow accounts and release workflows |
| `src/exchange-rates/` | Rate providers, caching and comparison |
| `src/fees/` | Fee calculation and matrices |
| `src/financial-health/` | Financial health reporting |
| `src/firebase/` | Firebase integration |
| `src/gateways/` | Socket.IO gateways |
| `src/graphql/` | GraphQL API |
| `src/health/` | Health indicators and endpoints |
| `src/i18n/` | Translation files |
| `src/intelligent-sms-routing/` | SMS routing rules |
| `src/kyc/` | KYC documents and verification |
| `src/ledger/` | Ledger entries and reconciliation |
| `src/migrations/` | TypeORM migrations |
| `src/modules/` | Shared infrastructure modules (see below) |
| `src/notifications/` | Email and in-app notifications |
| `src/otps/` | One-time passwords |
| `src/portfolio/` | Portfolio reporting |
| `src/push-notifications/` | Firebase push notifications |
| `src/qr/` | QR code generation |
| `src/rate-alerts/` | Rate threshold alerts |
| `src/receipts/` | Receipt generation and export |
| `src/referrals/` | Referral codes and rewards |
| `src/sanctions/` | Sanctions screening |
| `src/scheduled-jobs/` | Scheduled background tasks |
| `src/super-admin/` | Managed admins and platform controls |
| `src/tax/` | Tax calculation and reporting |
| `src/tokens/` | Refresh token helpers |
| `src/transactions/` | Transaction processing and reversals |
| `src/two-factor/` | TOTP-based 2FA |
| `src/unified-activity-feed/` | Aggregated activity feed |
| `src/users/` | User management and profiles |
| `src/vaults/` | Savings vaults |
| `src/wallets/` | Wallet management |
| `src/webhooks/` | Webhook endpoints and deliveries |

### `src/modules/`

| Directory | Contents |
|-----------|----------|
| `src/modules/auth/` | Authentication helpers |
| `src/modules/compliance/` | AML, SAR and compliance flags |
| `src/modules/expenses/` | Expense entities |
| `src/modules/flags/` | Feature flags |
| `src/modules/gdpr/` | Consent and erasure workflows |
| `src/modules/mail/` | Mail queue processing |
| `src/modules/micro-savings/` | Savings rules and contributions |
| `src/modules/queues/` | BullMQ setup and queue dashboard |
| `src/modules/redis/` | Redis client and throttler storage |
| `src/modules/stellar/` | Stellar service wrapper |
| `src/modules/storage/` | Local and S3 storage |
| `src/modules/webhooks/` | Webhook payload schemas |

---

## 📄 API Documentation

Swagger decorators are present on controllers, but the Swagger UI is not mounted yet. Use the root and health endpoints, or read the controller sources, for API details.

---

## 🧱 Blockchain Integration

**Stellar Network** provides the foundation for trustless, fast international transfers:

- **Smart Contracts**: Rust-based contracts deployed on Stellar
- **Horizon API**: Communication layer for account, ledger, and transaction queries
- **Asset Creation**: Native and custom asset support
- **Multi-Signature Accounts**: Enhanced security for hot wallets
- **Transaction Flow**: NestJS service → Stellar SDK → Horizon → Ledger

Current implementation:
- [x] Account creation and funding
- [x] Asset issuance
- [x] Payment operations
- [x] Transaction signing and submission
- [ ] Advanced: path payments, atomic swaps

---

## 🧪 Testing Strategy

### Unit & Integration Tests

```bash
npm run test           # Run all tests
npm run test:watch    # Watch mode (re-run on file changes)
npm run test:cov      # Generate coverage report
```

Test files follow the pattern: `*.spec.ts`  
Coverage reports are generated in `coverage/` directory

### E2E Tests

```bash
npm run test:e2e       # Run end-to-end tests
npm run test:debug     # Debug mode (use Chrome DevTools on port 9229)
```

## Environment Variables

- `NODE_ENV` — runtime environment. Allowed values: `development`, `staging`, `production`, `test`.
- `PORT` — application port, default `3000`.
- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — JWT signing secret, minimum 32 characters.
- `JWT_EXPIRES_IN` — JWT expiration time, e.g. `15m`, `1h`, `7d`.
- `ALLOWED_ORIGINS` — comma-separated allowed CORS origins.

## Health Check

- `GET /`
- `GET /health`

## Real-Time Transport Architecture
Real-time updates are provided by the Socket.IO gateways in `src/gateways/`. GraphQL support lives in `src/graphql/`; subscriptions are not enabled.
