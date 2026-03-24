# NexaFX Backend

**NexaFX** is a Web3-powered currency exchange platform that supports real-time fiat and crypto conversions. The backend is built using **NestJS** and interfaces with smart contracts written in **Rust** on the **Stellar network**.

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

- **Node.js**: v18+ (LTS recommended)
- **PostgreSQL**: v12+ running locally or via Docker
- **npm** or **yarn**

### 1. Clone the Repository

```bash
git clone https://github.com/Nexacore-Org/NexaFx-backend.git
cd NexaFx-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

Copy the `.env.example` file and create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and configure your variables (see [Environment Variables](#-environment-variables) section below).

### 4. Setup Database with TypeORM

Initialize the PostgreSQL database and apply migrations:

```bash
# Ensure PostgreSQL is running and DATABASE_URL is configured in .env
# TypeORM will auto-synchronize schema on startup if synchronize: true

# Create the database (first time only)
npm run typeorm:db:create

# Run migrations
npm run typeorm:migration:run

# OR generate a new migration after schema changes
npm run typeorm:migration:generate -- src/migrations/my-migration-name

# To revert the last migration
npm run typeorm:migration:revert
```

> **Note**: The application uses TypeORM with `autoLoadEntities: true`, which automatically loads all entity metadata. Ensure all `.entity.ts` files are properly decorated with `@Entity()`.

### 5. Run the Application

```bash
# Development (watch mode)
npm run start:dev

# Debug mode
npm run start:debug

# Production
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`
API documentation: `http://localhost:3000/api/docs`

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

E2E test suite: `test/jest-e2e.json`

### Best Practices
- Use `describe()` blocks for logical grouping
- Mock external services (Stellar, Mailgun, etc.)
- Test controller endpoints with `supertest`
- Test services in isolation with mocked repositories
- Aim for 80%+ coverage for critical paths

---

## 📝 Development Workflow

### Commit Message Format

Follow **Conventional Commits**:

```bash
type(scope): subject

# Types: feat, fix, docs, style, refactor, perf, test, chore
# Scopes: auth, users, transactions, etc.

# Examples:
git commit -m "feat(transactions): add Stellar integration"
git commit -m "fix(auth): validate JWT expiration"
git commit -m "docs(readme): update setup instructions"  
git commit -m "chore(deps): upgrade NestJS to 11.0.2"
```

### Pull Request Workflow

1. Create feature branch: `git checkout -b feature/your-feature-name`
2. Make changes and write tests
3. Submit PR with description and linked issue
4. Wait for CI/CD checks and code review
5. Merge after approval

---

## 📌 Project Roadmap

### ✅ Completed

- [x] Authentication module with JWT and refresh tokens
- [x] User management (CRUD, profile, roles)
- [x] Multi-currency support (fiat + crypto)
- [x] **Transactions module with full Stellar integration** ← Currently fully implemented
- [x] Real-time exchange rate updates
- [x] KYC/AML compliance workflows
- [x] Email notifications (Mailgun)
- [x] Push notifications (Firebase)
- [x] Admin controls and audit logging
- [x] Transaction receipts and export (PDF/CSV/Excel)
- [x] Two-factor authentication (TOTP)
- [x] Referral program
- [x] Fee management system
- [x] Scheduled background jobs
- [x] Rate alerts
- [x] Beneficiary management

### 🚧 In Progress

- [ ] Advanced payment routing (path payments)
- [ ] DAO governance and voting
- [ ] Smart contract optimization

### 📋 Planned

- [ ] Mobile app (React Native)
- [ ] Multi-wallet support
- [ ] API rate tiering
- [ ] Advanced reporting and analytics
- [ ] Webhook events system
- [ ] GraphQL API layer

---

## 🛠️ Troubleshooting

### Common Setup Issues

#### 1. **Database Connection Error**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**:
- Verify PostgreSQL is running: `brew services list` (macOS) or `sudo systemctl status postgresql` (Linux)
- Check `DATABASE_URL` in `.env`
- Default: `postgresql://postgres:postgres@localhost:5432/nexafx`
- Create database if missing: `createdb nexafx`

#### 2. **TypeORM Migrations Fail**

```
Error: migrations not found
```

**Solution**:
```bash
# Ensure migration scripts exist in package.json
npm run typeorm:migration:run  # Run pending migrations
npm run typeorm:migration:create -- src/migrations/fresh-migration
```

#### 3. **JWT Token Verification Failed**

```
Error: jwt malformed
```

**Solution**:
- Verify `JWT_SECRET` is set in `.env` (minimum 32 characters)
- Ensure token format: `Authorization: Bearer <token>`
- Check token expiration: `JWT_EXPIRES_IN` (default: 15m)

#### 4. **Stellar Network Connection Error**

```
Error: ECONNREFUSED (Horizon endpoint)
```

**Solution**:
- Verify `STELLAR_HORIZON_URL`: testnet=`https://horizon-testnet.stellar.org`
- Check internet connectivity
- Verify `STELLAR_NETWORK` is set to `TESTNET` or `PUBLIC`
- Testnet transactions: browse at https://stellar.expert/explorer/testnet

#### 5. **Email Sending Not Working**

```
Error: Mailgun credentials invalid
```

**Solution**:
- Verify Mailgun API key and domain in `.env`
- Check `MAILGUN_DOMAIN` is verified in Mailgun dashboard
- Test: `SKIP_EMAIL_SENDING=true` to bypass sending locally
- Ensure `MAILGUN_FROM_EMAIL` matches verified sender

#### 6. **Port 3000 Already in Use**

```
Error: listen EADDRINUSE :::3000
```

**Solution**:
```bash
# Kill the process
lsof -ti:3000 | xargs kill -9       # macOS/Linux
netstat -ano | findstr :3000        # Windows

# Or use a different port
PORT=3001 npm run start:dev
```

#### 7. **Module Not Found Error**

```
Error: Cannot find module '@nestjs/typeorm'
```

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Debugging Tips

**Enable Debug Logging**:
```bash
DEBUG=* npm run start:dev
```

**TypeORM Query Logging**:
Add to `.env`:
```
TYPEORM_LOGGING=true
```

**Check Application State**:
```bash
curl http://localhost:3000/health
```

**View API Docs**:
```
http://localhost:3000/api/docs
```

---

## 🔗 Related Repositories & Resources

| Resource | URL | Purpose |
|----------|-----|---------|
| **Frontend** | [NexaFx-frontend](https://github.com/Nexacore-Org/NexaFx-frontend) | Next.js 14 web UI with React, Tailwind CSS |
| **Smart Contracts** | [NexaFx-contract](https://github.com/Nexacore-Org/NexaFx-contract) | Rust smart contracts deployed on Stellar |
| **API Docs** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | Interactive Swagger documentation (local) |
| **Stellar Testnet Explorer** | [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet) | View transactions and accounts on Stellar testnet |
| **Stellar Horizon API** | [horizon-testnet.stellar.org](https://horizon-testnet.stellar.org) | Official Stellar Horizon API endpoint |

---

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---

## 📧 Support & Community

Have questions, need help, or want to contribute? Here's how to reach us:

| Channel | Link | Purpose |
|---------|------|---------|
| **Email** | [contact@nexacore.org](mailto:contact@nexacore.org) | Business inquiries, partnerships |
| **Telegram** | [t.me/NexaFx](https://t.me/+WkWO3kNnA-1mYzVk) | Community chat, quick support |
| **GitHub Issues** | [Issues](https://github.com/Nexacore-Org/NexaFx-backend/issues) | Bug reports, feature requests |
| **Discussions** | [Discussions](https://github.com/Nexacore-Org/NexaFx-backend/discussions) | Technical questions, ideas |

---

## 👥 Contributing

We welcome contributions from the community! Please start with:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature`
3. **Commit** changes: `git commit -m "feat(module): description"` (see [Commit Format](#-development-workflow))
4. **Push** to your fork: `git push origin feature/your-feature`
5. **Open** a Pull Request with your changes

**Before submitting**:
- [ ] Tests pass: `npm run test`
- [ ] Linting passes: `npm run lint`
- [ ] Coverage is adequate
- [ ] Updated README if adding major features

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

**Happy coding! 🚀**
