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

    subgraph Database
        PostgreSQL[(PostgreSQL)]
        Redis[(Redis Cache)]
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
    
    Auth --> PostgreSQL
    Users --> PostgreSQL
    Currencies --> PostgreSQL
    Transactions --> PostgreSQL
    ExchangeRates --> Redis
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
│   ├── admin/                # Admin panel and controls
│   ├── audit-logs/           # Audit trail and logging
│   ├── auth/                 # JWT authentication & authorization
│   ├── beneficiaries/        # Beneficiary management
│   ├── blockchain/           # Stellar blockchain integration
│   ├── common/               # Shared guards, interceptors, decorators, services
│   ├── currencies/           # Fiat and crypto currency management
│   ├── database/             # Database seeding scripts
│   ├── exchange-rates/       # Real-time exchange rate providers
│   ├── fees/                 # Transaction fee management
│   ├── health/               # Health check endpoints
│   ├── kyc/                  # KYC/AML compliance
│   ├── notifications/        # Push & email notifications
│   ├── otps/                 # One-time passwords for 2FA
│   ├── push-notifications/   # Firebase push notifications
│   ├── rate-alerts/          # Rate change alerts (utility)
│   ├── receipts/             # Transaction receipts
│   ├── referrals/            # Referral program
│   ├── scheduled-jobs/       # Background scheduled tasks
│   ├── tokens/               # Refresh token management (utility)
│   ├── transactions/         # Transaction processing & tracking
│   ├── two-factor/           # Two-factor authentication
│   ├── users/                # User management (CRUD, roles, profiles)
│   ├── app.module.ts         # Root application module
│   ├── app.controller.ts     # Root application controller
│   ├── app.service.ts        # Root application service
│   └── main.ts               # Application entry point
├── migrations/               # TypeORM migration files
├── test/                     # E2E and integration tests
├── .env.example              # Environment configuration template
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

---

## 📦 Tech Stack

- **Backend Framework**: NestJS 11, TypeScript 5.7
- **Database ORM**: TypeORM 0.3 (PostgreSQL)
- **Authentication**: JWT (Passport.js), Bcrypt, TOTP
- **Blockchain**: Stellar SDK with Horizon API integration
- **Background Jobs**: NestJS Schedule (@nestjs/schedule)
- **Notifications**: Mailgun (email), Firebase (push notifications)
- **Rate Limiting**: NestJS Throttler
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest, Supertest
- **Code Quality**: ESLint, Prettier

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20+ (LTS recommended)
- **Docker & Docker Compose**: For running PostgreSQL
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

#### 4. Start Database with Docker

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

- **API Docs**: Visit `http://localhost:3000/api/docs` for Swagger UI
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
| `DATABASE_URL` | string | ✅ Yes | `postgresql://user:pass@localhost:5432/nexafx` | PostgreSQL connection string |
| `DB_HOST` | string | ✅ Yes | `localhost` | Database host address |
| `DB_PORT` | number | ✅ Yes | `5432` | Database port |
| `DB_USERNAME` | string | ✅ Yes | `postgres` | Database user |
| `DB_PASSWORD` | string | ✅ Yes | `secure_password` | Database password |
| `DB_NAME` | string | ✅ Yes | `nexafx` | Database name |

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
| `EXCHANGE_RATES_PROVIDER_BASE_URL` | string | ✅ Yes | Provider API base URL (default: `https://api.exchangerate.host`) |
| `EXCHANGE_RATES_PROVIDER_API_KEY` | string | ❌ No | API key if required by provider |
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
- **SUPER_ADMIN**: System-level administrative access (future)

Guards are applied at controller and route levels using custom decorators (`@RequireRole()`, `@Permissions()`) and NestJS Guards.

---

## 📁 Module Overview & Architecture

All major modules are fully implemented and integrated:

| Module | File Location | Purpose | Status |
|--------|---|---------|--------|
| **auth** | `src/auth/` | JWT authentication, password reset, OAuth2 strategies. Implements Passport.js strategies and JWT verification | ✅ Complete |
| **admin** | `src/admin/` | Admin dashboard, user moderation, system controls, configuration management | ✅ Complete |
| **users** | `src/users/` | User CRUD operations, profile management, roles, KYC status, personal data storage | ✅ Complete |
| **currencies** | `src/currencies/` | Fiat and crypto currency registry, metadata, pairs, support matrix | ✅ Complete |
| **transactions** | `src/transactions/` | Core exchange transactions, Stellar blockchain integration, settlement tracking, reversals | ✅ Complete |
| **exchange-rates** | `src/exchange-rates/` | Real-time rate fetching, multi-provider aggregation, in-memory caching | ✅ Complete |
| **beneficiaries** | `src/beneficiaries/` | Manage recipient accounts, wallets, bank details for transactions | ✅ Complete |
| **kyc** | `src/kyc/` | KYC/AML workflows, document collection, verification, compliance status | ✅ Complete |
| **notifications** | `src/notifications/` | Email & SMS system via Mailgun, verification codes, alerts, announcements | ✅ Complete |
| **push-notifications** | `src/push-notifications/` | Firebase Cloud Messaging (FCM) integration for mobile push notifications | ✅ Complete |
| **referrals** | `src/referrals/` | Referral program tracking, unique codes, rewards, commission calculation | ✅ Complete |
| **receipts** | `src/receipts/` | Transaction receipt generation and export (PDF via pdfkit, CSV, Excel via exceljs) | ✅ Complete |
| **fees** | `src/fees/` | Dynamic fee calculation, fee matrices, tier-based pricing, settlement | ✅ Complete |
| **audit-logs** | `src/audit-logs/` | Comprehensive audit trail for compliance, debugging, user activity tracking | ✅ Complete |
| **scheduled-jobs** | `src/scheduled-jobs/` | Background tasks: rate updates, data cleanup, notification batching, reconciliation | ✅ Complete |
| **common** | `src/common/` | Shared infrastructure: global guards, interceptors, decorators, pipes, error filters, shared services | ✅ Complete |
| **health** | `src/health/` | Health check endpoints for monitoring, load balancer integration, readiness/liveness probes | ✅ Complete |
| **blockchain** | `src/blockchain/` | Stellar SDK integration, Horizon API communication, contract deployment, transaction signing | ✅ Complete |
| **two-factor** | `src/two-factor/` | TOTP-based 2FA, recovery codes, backup authentication methods | ✅ Complete |
| **otps** | `src/otps/` | One-time password generation, validation, expiration, retry limits | ✅ Complete |

---

## 📄 API Documentation

**Swagger/OpenAPI** documentation is available when the backend is running:

- **URL**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- Features: Interactive API explorer, request/response examples, schema definitions
- Auto-generated from NestJS decorators

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
