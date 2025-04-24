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

## 🏗️ Project Architecture

```
nexafx-backend/
├── src/
│   ├── auth/              # JWT auth module
│   ├── users/             # User management (CRUD, roles)
│   ├── currencies/        # Fiat and crypto currency support
│   ├── transactions/      # Transaction logs and conversions
│   ├── common/            # Guards, interceptors, decorators
│   ├── config/            # Environment configs and database setup
│   └── main.ts            # Application entry point
├── migrations/            # SQL migration files (e.g. using TypeORM CLI)
├── test/                  # Unit and integration tests
├── .env.example           # Sample environment configuration
├── package.json
└── README.md
```

---

## 📦 Tech Stack

- **Backend**: NestJS, TypeScript
- **ORM**: TypeORM (PostgreSQL)
- **Security**: JWT, Bcrypt
- **Blockchain**: Stellar (Rust smart contracts)
- **Exporting**: pdfkit, exceljs, fast-csv
- **Testing**: Jest, Supertest

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory. Refer to `.env.example`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/nexafx
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=1d
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_ADMIN_SECRET=your_stellar_admin_secret
```

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/nexafx-backend.git
cd nexafx-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run the Application

```bash
npm run start:dev
```

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

## 🔐 Role-Based Access

- `USER`: Can perform standard exchange operations
- `TUTOR`: Manages educational content (future module)
- `ADMIN`: Full control of all resources

Guards are applied at controller and route levels using custom decorators and NestJS Guards.

---

## 📁 Modules Overview

| Module        | Description                                |
| ------------- | ------------------------------------------ |
| `auth`        | JWT login, registration, guards            |
| `users`       | User CRUD, roles, profile                  |
| `currencies`  | Supported fiat & crypto currencies         |
| `transactions`| Track exchanges & conversions (CRUD)       |
| `common`      | Utilities, global guards, DTOs             |

---

## 📄 API Documentation

**Coming Soon**: Swagger/OpenAPI integration for full REST endpoint visibility.

---

## 🧱 Smart Contract Integration

- Rust-based contracts deployed on **Stellar testnet**
- Integration handled via service in NestJS using Horizon APIs
- Each transaction is optionally linked with a smart contract execution (future roadmap)

---

## 📝 Commit Message Format

```bash
# Format:
type(scope): subject

# Examples:
feat(auth): implement refresh token strategy
fix(users): validate email uniqueness
chore(deps): upgrade Prisma to 5.0.0
```

---

## 📌 Roadmap

- [x] Auth Module with JWT
- [x] Users Module with roles
- [x] Currencies Module (Fiat + Crypto)
- [ ] Transactions Module with Stellar link
- [ ] DAO & Reward System (via Smart Contracts)
- [ ] Real-time rate updates
- [ ] Export features

---

## 🔗 Related Repositories

- [`nexafx-frontend`](https://github.com/Nexacore-Org/NexaFx-frontend) — Next.js UI
- [`nexafx-contracts`](https://github.com/Nexacore-Org/NexaFx-contract) — Rust smart contracts on Stellar



## 📜 License

MIT License. See `LICENSE` file.
