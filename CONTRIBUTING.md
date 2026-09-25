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

## ✅ CI Must Be Green Before Merge

CI is a gate, not a formality. A pull request may only be merged once **every**
required check on the surviving pipeline (`.github/workflows/ci-v2.yml`) has
actually **passed** — not merely run.

- **Green means green.** A check that is present but skipped, neutral, or
  "passing" because its failures were swallowed is **not** green. Do not merge
  on a yellow/neutral result.
- **Masked steps are not acceptable in this repo.** Never append `|| true`
  (or otherwise swallow the exit code) to a verification step such as lint,
  `tsc --noEmit`, migrations, tests, or the build. If a step is worth running in
  CI, it is worth failing the build when it breaks. Fix the underlying failure
  instead of masking it.
- **Exactly one pipeline governs `v2`.** `ci-v2.yml` is the sole CI workflow for
  pushes and pull requests to `v2`; the legacy masked `ci.yml` has been retired
  and deleted. Do not reintroduce a second, parallel pipeline.
- **Required status checks.** The jobs in `ci-v2.yml` are configured as required
  status checks on the `v2` branch in GitHub branch protection settings. This is
  a repository setting, not something a workflow file can enforce — if you have
  admin access and the checks are not blocking, fix the branch protection rule.
- **Expect red while fixes land.** Turning off masking is intentional: until the
  compile-error fixes elsewhere in the wave are merged, the pipeline will be red.
  That is the correct outcome — land the fixes, don't re-mask the checks.

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
- [ ] CI (`ci-v2.yml`) is green — all required checks passed, none masked

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

### Creating Migration

/* … truncated 3904 chars — edit only what you need near the top … */
