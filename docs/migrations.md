# Database Migrations — NexaFX Backend

This document describes the migration strategy for the NexaFX v2 backend:
zero-downtime patterns, two-phase schema changes, rollback expectations,
dry-run validation, and the snapshot workflow.

---

## Table of Contents

1. [Zero-Downtime Migrations](#1-zero-downtime-migrations)
2. [Two-Phase Schema Changes](#2-two-phase-schema-changes)
3. [Rollback Expectations](#3-rollback-expectations)
4. [Dry-Run Validation](#4-dry-run-validation)
5. [Snapshot Workflow](#5-snapshot-workflow)
6. [Transactional Migration Pattern](#6-transactional-migration-pattern)
7. [Admin Endpoint](#7-admin-endpoint)
8. [Secrets Required](#8-secrets-required)

---

## 1. Zero-Downtime Migrations

Zero-downtime migrations ensure the application continues serving traffic
while schema changes are applied. Follow these principles:

### Additive changes only (per deployment)

- **Add** new columns with `DEFAULT` values or `NULLABLE`.
- **Never** rename or drop columns in the same deployment as the code that
  removes references to them.
- **Never** add a `NOT NULL` constraint to an existing column without a
  `DEFAULT` in the same migration.

### Backward-compatible code deploys

- Deploy code that handles both the old and new schema **before** applying
  the migration.
- Only after the migration is applied (and verified) should backward-compat
  code be removed in a subsequent deploy.

### Avoid long-running locks

- Avoid `ALTER TABLE ... ADD CONSTRAINT` with validation on large tables
  without `NOT VALID` first.
- Use `CREATE INDEX CONCURRENTLY` to avoid table locks on large tables.
  > ⚠️ `CREATE INDEX CONCURRENTLY` **cannot** run inside a transaction block.
  > For such cases do NOT use `queryRunner.startTransaction()`.

---

## 2. Two-Phase Schema Changes

Some schema changes are inherently multi-step. Split them across two separate
migration files and two separate deployments.

### Pattern: Rename a column

| Phase | Migration | Code |
|-------|-----------|------|
| 1 | `ALTER TABLE t ADD COLUMN new_name type` | Read `old_name`, write both |
| 2 | `ALTER TABLE t DROP COLUMN old_name` | Read/write `new_name` only |

### Pattern: Change a column type

| Phase | Migration | Code |
|-------|-----------|------|
| 1 | Add `new_col` with converted default | Dual-write `old_col` + `new_col` |
| 2 | Drop `old_col`, rename `new_col` | Read/write `new_col` only |

### Pattern: Add a NOT NULL constraint

| Phase | Migration | Code |
|-------|-----------|------|
| 1 | Add column with `DEFAULT` or `NULLABLE`; backfill | Code writes non-null values |
| 2 | `ALTER TABLE t ALTER COLUMN col SET NOT NULL` | Column always populated |

---

## 3. Rollback Expectations

### What can be rolled back

All migrations **must** implement a `down()` method that fully undoes the
`up()`. TypeORM's `migration:revert` command will call `down()` of the most
recently applied migration.

### What cannot be safely rolled back

| Operation | Reason | Mitigation |
|-----------|--------|------------|
| `DROP TABLE` | Data is permanently lost | Never drop in the same migration as code removal |
| `DROP COLUMN` | Data is permanently lost | Two-phase approach |
| `TRUNCATE` | Data is permanently lost | Avoid in migrations |
| DML (`DELETE`, `UPDATE` mass updates) | May be irreversible | Only seed constant reference data |

### Rollback SLA

| Environment | Auto-rollback | How |
|-------------|--------------|-----|
| **staging** | ✅ Automatic | Via pre-migration workflow on health-check failure |
| **production** | ❌ Manual | On-call engineer must approve and execute steps |

---

## 4. Dry-Run Validation

Every PR targeting `v2` must pass migration rollback validation before merge.
This runs automatically via the `ci-v2.yml` workflow.

### How it works

```
npm run migration:validate
```

The script (`scripts/validate-migrations.ts`):

1. Starts a temporary `postgres:15` Docker container on port `45432`.
2. Waits for PostgreSQL to accept connections.
3. Runs `typeorm migration:run` (all pending migrations, `up`).
4. Runs `typeorm migration:revert` once for **each** migration file (all `down`).
5. If any step fails → exits `1` with an error message.
6. If all steps pass → exits `0`.
7. Always stops and removes the temporary container.

### Running locally

Prerequisites: Docker must be running.

```bash
npm run migration:validate
```

### Interpreting failures

| Error | Likely cause |
|-------|-------------|
| `Docker CLI not found` | Docker is not installed or not in PATH |
| `PostgreSQL did not become ready` | Docker image pull failed or port conflict |
| `migration:run failed` | Syntax error or constraint violation in `up()` |
| `migration:revert failed` | `down()` is incomplete, incorrect, or missing |

---

## 5. Snapshot Workflow

Before applying migrations to **staging** or **production**, run the
`pre-migration` workflow via GitHub Actions.

### Trigger

GitHub Actions → **Workflows** → **Pre-Migration Workflow** → **Run workflow**

Select target environment: `staging` or `production`.

### What the workflow does

```
1. Count pending migration files
2. pg_dump → upload to S3 (nexafx/pre-migration/<env>/<timestamp>-<count>.dump)
3. Insert PENDING record into migration_snapshots
4. npm run typeorm:migration:run
5. Mark snapshot APPLIED
6. GET /health   (must return 200)
7. GET /admin/metrics  (must return 200)
```

### On health-check failure

**Staging — auto-rollback:**

```
1. npm run typeorm:migration:revert  (repeated for each migration)
2. aws s3 cp <snapshot-key> /tmp/rollback.dump
3. pg_restore --clean --if-exists /tmp/rollback.dump
4. Mark snapshot ROLLED_BACK
5. Slack alert sent
```

**Production — manual confirmation required:**

```
Workflow fails with instructions.
On-call engineer must:
  1. Review the health-check failure
  2. Decide to roll back
  3. Execute the revert commands manually
  4. Update the snapshot record to ROLLED_BACK
```

### S3 snapshot key format

```
nexafx/pre-migration/<environment>/<ISO-timestamp>-<migrationCount>.dump
```

Example:
```
nexafx/pre-migration/staging/2026-06-27T00-00-00Z-3.dump
```

### Snapshot record fields

| Field | Description |
|-------|-------------|
| `id` | UUID primary key |
| `environment` | `staging` or `production` |
| `snapshotKey` | S3 object key |
| `migrationCount` | Number of migration files applied |
| `status` | `PENDING` → `APPLIED` → `ROLLED_BACK` |
| `appliedAt` | When migration completed successfully |
| `rolledBackAt` | When this snapshot was restored (nullable) |
| `takenAt` | When the snapshot was created |

---

## 6. Transactional Migration Pattern

All NexaFX v2 migrations **must** wrap DDL operations in explicit
transactions. This ensures the database is not left in a partially-migrated
state on error.

### Required pattern

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class MyMigration1234567890000 implements MigrationInterface {
  name = 'MyMigration1234567890000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`CREATE TABLE ...`);
      await queryRunner.query(`ALTER TABLE ...`);
      // ... other DDL

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`DROP TABLE IF EXISTS ...`);
      // ... undo DDL in reverse order

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}
```

### Exceptions

Some PostgreSQL DDL **cannot** run inside a transaction block:

| Operation | Reason | Alternative |
|-----------|--------|-------------|
| `CREATE INDEX CONCURRENTLY` | Requires no active transaction | Run outside transaction; add guard |
| `VACUUM` | Cannot run in transaction | Run as maintenance task |

For these cases, omit the transaction wrapper and document the reason clearly
in the migration file.

### Generating a new migration

```bash
npm run typeorm:migration:generate -- -n MyMigrationName
```

Then wrap the generated `up()` and `down()` in the transactional pattern above.

---

## 7. Admin Endpoint

`GET /admin/migrations` returns the full migration history.

**Authentication:** Bearer token, Admin role required.

**Response shape:**

```json
{
  "appliedMigrations": [
    { "id": 1, "timestamp": "1760000000000", "name": "CreateNotificationPreferences1760000000000" }
  ],
  "snapshots": [
    {
      "id": "uuid",
      "environment": "staging",
      "snapshotKey": "nexafx/pre-migration/staging/2026-06-27T00-00-00Z-3.dump",
      "migrationCount": 3,
      "status": "APPLIED",
      "appliedAt": "2026-06-27T00:05:00.000Z",
      "rolledBackAt": null,
      "takenAt": "2026-06-27T00:00:00.000Z"
    }
  ],
  "summary": {
    "totalApplied": 1,
    "totalSnapshots": 1,
    "pendingSnapshots": 0,
    "appliedSnapshots": 1,
    "rolledBackSnapshots": 0
  }
}
```

---

## 8. Secrets Required

The pre-migration workflow requires the following GitHub Actions secrets
configured per environment:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Full PostgreSQL connection string |
| `DB_HOST` | Database host (for pg_dump) |
| `DB_PORT` | Database port (default: 5432) |
| `DB_USER` | Database user (for pg_dump) |
| `DB_PASSWORD` | Database password (for pg_dump) |
| `DB_NAME` | Database name (for pg_dump) |
| `MIGRATION_SNAPSHOT_S3_BUCKET` | S3 bucket name |
| `AWS_ACCESS_KEY_ID` | AWS access key with S3 write access |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | AWS region (e.g. `eu-west-1`) |
| `APP_BASE_URL` | Base URL for health check requests |
| `ADMIN_HEALTH_CHECK_TOKEN` | Bearer token for `/admin/metrics` |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for rollback alerts |
