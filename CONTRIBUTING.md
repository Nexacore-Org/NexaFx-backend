# Contributing to NexaFX Backend

Welcome! We're excited that you're interested in contributing to the **NexaFX Backend**. This guide will help you get started with local development, code standards, branching, and submitting pull requests.

---

## 🚀 Getting Started

1. **Fork the Repository**  
   Click the "Fork" button on the top right of the GitHub page.

2. **Clone Your Fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/nexafx-backend.git
   cd nexafx-backend
   ```

3. **Install Dependencies**

   ```bash
   npm install
   ```

4. **Setup Your Local Environment**  
   Copy the `.env.example` file to `.env` and fill in the necessary variables.

   ```bash
   cp .env.example .env
   ```

5. **Run the Application**

   ```bash
   npm run start:dev
   ```

---

## 🌱 Branching Strategy

- Use the `main` branch for production-ready code.
- All new features or fixes should be based off the latest `main` branch.

### Naming Conventions

| Type       | Example Branch Name              |
|------------|----------------------------------|
| Feature    | `feature/transactions-export`    |
| Fix        | `fix/auth-role-guard`            |
| Refactor   | `refactor/db-service`            |
| Chore      | `chore/update-deps`              |

---

## 🧪 Writing Tests

- Include unit or e2e tests for your changes when applicable.
- Use Jest and Supertest for testing.
- Run tests before pushing:

  ```bash
  npm run test
  ```

---

## 📝 Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for all commits.

### Format

```
type(scope): description
```

### Examples

- `feat(auth): add refresh token strategy`
- `fix(users): correct email validation`
- `chore(env): add Stellar config values`

---

## 🔐 Security Scanning and TruffleHog False Positives

Pull requests are blocked when security checks fail. This includes TruffleHog secret scanning, npm audit, and CodeQL checks.

If TruffleHog flags a potential secret:

1. Treat it as real first.
   - If it might be a real credential, revoke/rotate it immediately.
   - Remove the exposed value from git history when required.

2. Confirm whether it is a false positive.
   - Template placeholders in `.env.example` are allowlisted in `.trufflehog.yml`.
   - For non-sensitive test data in other files, add a short justification in your PR.

3. Resolve false positives in a traceable way.
   - Prefer using a line-level `trufflehog:ignore` annotation where supported.
   - If a path-level allowlist is necessary, update `.trufflehog.yml` with the smallest possible scope and include a reason in the PR description.

4. Re-run checks and verify they pass before requesting review.

---

## 📥 Submitting a Pull Request

1. Push your changes to your forked repo:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a pull request to the `main` branch of the main repo.

3. In the PR description:
   - Describe what you did
   - Link any relevant issues
   - Mention reviewers if needed

---

## 📣 Applying to Work on an Issue

> 🚫 **Avoid generic comments like**:  
> _"Can I pick this up?"_ or _"Interested, assign me!"_  
> These will **not be accepted** and will be removed to keep the conversation clean.

If you're interested in contributing to an issue, please:

1. **Join our Telegram group** (link in the issue or project README)
2. **Send a short intro (3–6 sentences)** in the group that includes:
   - Who you are and what you do
   - Which issue you want to work on
   - How you plan to approach it
   - Your **ETA** (estimated time of delivery)

Only serious, clear, and actionable requests will be considered.  

---

## 🧹 Code Quality

- Follow NestJS conventions
- Lint your code before committing:

  ```bash
  npm run lint
  ```

- Format using Prettier:
  
  ```bash
  npm run format
  ```

---

## 🙏 Thank You

Thanks for contributing to **NexaFX** — your input makes the project better!
