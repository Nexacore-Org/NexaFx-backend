# Contributing to NexaFX Backend

Welcome! We're excited that you're interested in contributing to the **NexaFX Backend**. This guide will help you get started with local development, code standards, branching, and submitting pull requests.

---

## 📋 Prerequisites

To contribute to this project, ensure you have the following installed:

- **Node.js**: v20+ (LTS recommended) — always use the version pinned in [`.nvmrc`](./.nvmrc) (`nvm use`) so your local lock file matches CI
- **Docker & Docker Compose**: For running PostgreSQL and other services
- **npm**: v9+ (comes with Node.js)
- **Git**: For version control

---

## 🔒 Lock File Hygiene

`package-lock.json` must always stay in sync with `package.json`. CI runs `npm ci`,
which fails hard on any drift — this blocks every PR until it's fixed.

- **Always run `npm install`** (never edit `package.json` by hand and skip regenerating the lock file) after adding, removing, or updating a dependency, and commit the resulting `package-lock.json` change.
- **Never run `npm ci` to "fix" a failing install** — `npm ci` does not update the lock file; use `npm install` and verify with `npm ci --dry-run` before pushing.
- A pre-commit hook (via Husky, see `.husky/pre-commit`) runs `npm ci --dry-run` to verify lock file sync, then runs `npx lint-staged` to lint and format only staged files. If lint-staged finds issues, the commit is blocked. You can bypass the hook for emergency commits with `git commit --no-verify`.
- CI also runs a `Verify lock file sync` step (`npm ci --dry-run`) before installing, so drift fails fast with a clear message instead of a confusing `npm ci` error.
- Dependabot is configured (`.github/dependabot.yml`) to open weekly PRs for npm updates, keeping the lock file fresh and reducing manual drift.

---

## 🌿 Branch Rules

We follow a structured branching strategy with multiple long-lived branches:

| Branch     | Purpose                                                                 |
|------------|-------------------------------------------------------------------------|
| `main`     | Production-ready code - stable releases only                           |
| `v1`       | Legacy v1.x.x maintenance branch (for critical fixes only)             |
| `v2`       | Current development branch for v2.x.x features and improvements        |

### Naming Conventions

All feature/fix branches must be based on the appropriate base branch (usually `v2` for new work):

| Type       | Example Branch Name              | Base Branch |
|------------|----------------------------------|-------------|
| Feature    | `feature/widgets-module`         | `v2`        |
| Fix        | `fix/auth-jwt-expiration`        | `v2`        |
| Hotfix     | `hotfix/critical-db-issue`       | `main`      |
| Refactor   | `refactor/transaction-service`   | `v2`        |
| Chore      | `chore/update-eslint-config`     | `v2`        |

---

## 🛠️ Development Workflow

1. **Fork the Repository**  
   Click the "Fork" button on GitHub to create your own copy.

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/NexaFx-backend.git
   cd NexaFx-backend
   ```

3. **Setup Development Environment (Automated)**
   ```bash
   # This script handles everything: env vars, Docker, dependencies, migrations
   ./scripts/setup-dev.sh
   ```
   Or follow manual steps in the [README](./README.md) if you prefer.

4. **Create Your Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name v2
   ```

5. **Make Your Changes**
   - Follow the code standards outlined below
   - Write tests for new functionality
   - Ensure all existing tests pass

6. **Test Your Changes**
   ```bash
   npm run test          # Unit tests
   npm run test:e2e      # E2E tests
   npm run lint          # Linting
   npm run format        # Format code
   ```

7. **Commit & Push**
   ```bash
   git add .
   git commit -m "feat(module): description"  # Follow Conventional Commits
   git push origin feature/your-feature-name
   ```

8. **Open a Pull Request**
   - PRs should target `v2` branch (not `main`)
   - Fill out the PR template completely
   - Link to any related issues

---

## 📝 Conventional Commits

All commits **must** follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes only
- `style`: Code style (formatting, missing semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or correcting tests
- `chore`: Changes to build process or auxiliary tools

### Scopes

Use module names as scopes (e.g., `auth`, `transactions`, `currencies`, `common`, `kyc`).

### Examples

```bash
feat(widgets): add widget management module
fix(auth): correct JWT expiration validation
docs(contributing): update branch rules
style(common): format all files with Prettier
```

---

## 🎯 ESLint, Prettier & TypeScript Rules

### TypeScript
- Strict mode enabled (`strict: true`)
- No `any` type (use `unknown` or proper interfaces)
- Explicit return types for public methods
- Properly type all DTOs and entities

### ESLint
- All rules from `@typescript-eslint/recommended`
- `prettier` integration
- Run before commits: `npm run lint`

### Prettier
- Consistent code formatting
- Run on save or before commits: `npm run format`

### Git Hooks (optional but recommended)
- Use Husky for pre-commit hooks to auto-lint/format

---

## 🧪 Testing Requirements

Every PR must include appropriate tests:

- **Unit Tests**: For services, utils, and pure functions
- **E2E Tests**: For API endpoints and user flows
- **Coverage**: Aim for 80%+ coverage on new code

### Test Commands

```bash
npm run test              # Run all unit tests
npm run test:watch        # Run tests in watch mode
npm run test:cov          # Generate coverage report
npm run test:e2e          # Run E2E tests
```

### Test Structure
- Unit tests: `*.spec.ts` alongside source files
- E2E tests: `test/` directory
- Mock external services (Stellar, Mailgun, etc.)

---

## ✅ Pull Request Checklist

Before submitting your PR, ensure all items are checked:

- [ ] I have read the [Contributing Guidelines](./CONTRIBUTING.md)
- [ ] My code follows the project's style guidelines
- [ ] I have added tests that prove my fix is effective or feature works
- [ ] All new and existing tests pass locally
- [ ] I have updated the documentation (if needed)
- [ ] My commits follow the Conventional Commits format
- [ ] The PR targets the correct base branch (`v2`)
- [ ] I have linked any related issues in the PR description
- [ ] No secrets or sensitive data are committed
- [ ] ESLint and Prettier checks pass
- [ ] TypeScript compilation passes without errors

---

## 🔒 Security Disclosure

If you discover a security vulnerability, **do NOT open a public GitHub issue**. Instead:

1. **Report Privately**: Email security@nexacore.org with details
2. **Include**: Steps to reproduce, impact assessment, any proof of concept
3. **Response**: We will acknowledge your report within 48 hours
4. **Disclosure**: We will work with you to resolve the issue and coordinate disclosure

### What Not to Do
- Do NOT disclose vulnerabilities publicly
- Do NOT exploit vulnerabilities for testing
- Do NOT modify user data without permission
- Do NOT use automated scanners without prior approval

See [SECURITY.md](./SECURITY.md) for full details.

---

## 📊 Transactional Migration Pattern

All database schema changes **must** follow our transactional migration pattern:

### Rules
- **NEVER** use `synchronize: true` in any environment (see [ADR 0003](./docs/adr/0003-synchronize-false.md))
- All schema changes require TypeORM migrations
- Migrations must be idempotent where possible
- Migrations should be tested in a staging environment first

### Creating Migrations
```bash
npm run typeorm:migration:generate -- src/migrations/descriptive-migration-name
```

### Applying Migrations
```bash
npm run typeorm:migration:run
```

### Reverting Migrations
```bash
npm run typeorm:migration:revert
```

---

## 🏆 200-Point Rewards System

We reward contributors for their work! Earn points by completing tasks:

| Task Type                          | Points | Description                                  |
|------------------------------------|--------|----------------------------------------------|
| Documentation Update               | 50     | Improve docs, fix typos, add examples        |
| Bug Fix (Minor)                    | 100    | Fix small bugs, improve error handling       |
| Bug Fix (Major)                    | 200    | Fix critical issues affecting core features  |
| Feature (Small)                    | 150    | Add simple features or endpoints             |
| Feature (Medium/Large)             | 300+   | Complex features or modules (points vary)    |
| Code Refactor/Improvement          | 100    | Improve code quality, performance            |
| Test Coverage Increase             | 100    | Add tests to improve coverage by 5%+         |

### How to Redeem
- Points can be redeemed for swag, gift cards, or project tokens
- Track your progress in our Telegram group
- Points are awarded after PR merge by maintainers

---

## 📚 Architectural Decision Records (ADRs)

For key architectural decisions, refer to our ADRs in [docs/adr/](./docs/adr/):
- [0001 - NestJS over Express](./docs/adr/0001-nestjs-over-express.md)
- [0002 - TypeORM over Prisma](./docs/adr/0002-typeorm-over-prisma.md)
- [0003 - synchronize: false is a hard rule](./docs/adr/0003-synchronize-false.md)
- [0004 - Decimal.js for money](./docs/adr/0004-decimaljs-for-money.md)
- [0005 - Stellar over Ethereum/Solana](./docs/adr/0005-stellar-over-ethereum-solana.md)
- [0006 - CQRS for transactions module](./docs/adr/0006-cqrs-for-transactions.md)

---

## 🔄 Database Migrations (v2 — Required)

All database migrations on the **v2** branch **must** follow the transactional
pattern. PRs that do not comply will be rejected during review.

### Mandatory pattern

Every migration `up()` and `down()` must be wrapped in an explicit transaction:

```typescript
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`...`);
    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  }
}
```

Apply the same pattern to `down()`.

> **Exception**: DDL that cannot run inside a transaction (e.g.
> `CREATE INDEX CONCURRENTLY`) must be placed outside the transaction block
> with a clear comment explaining why.

### Generating a new migration

```bash
npm run typeorm:migration:generate -- -n YourMigrationName
```

Then wrap the generated `up()` and `down()` in the transactional pattern above.

### Dry-run validation (required before merge)

Every PR targeting `v2` automatically runs migration rollback validation via
the `ci-v2.yml` workflow. You can run it locally before pushing:

```bash
# Docker must be running
npm run migration:validate
```

This starts a temporary PostgreSQL container, runs all migrations up, then
reverts every one of them. If any `down()` fails, the PR **cannot** merge.

### Pre-migration snapshots (required for staging/production)

Before applying migrations to any live environment, trigger the
**Pre-Migration Workflow** on GitHub Actions and select the target environment.
This takes a `pg_dump` snapshot and uploads it to S3 before running
migrations. See [docs/migrations.md](docs/migrations.md) for full details.

---

## 🙏 Thank You

Thanks for contributing to **NexaFX** — your input makes the project better!

If you have questions, join our [Telegram group](https://t.me/+WkWO3kNnA-1mYzVk).
