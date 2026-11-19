/**
 * src/migrations/__tests__/migration-validation.spec.ts
 *
 * Tests the logic that the migration validation script exercises:
 *  - successful up/down/up cycle with no schema drift exits 0
 *  - a failed revert, a failed second up or schema drift causes exit code 1
 *  - Docker unavailability causes exit code 1
 *
 * Since scripts/validate-migrations.ts drives Docker and the TypeORM CLI,
 * we test the business logic by extracting and mocking the helpers.
 */

import * as path from 'path';
import * as fs from 'fs';
import { getMetadataArgsStorage, QueryRunner } from 'typeorm';
import { AddMissingIndexes1715421500000 } from '../1715421500000-AddMissingIndexes';
import { CreateDaoTables1762500000000 } from '../1762500000000-CreateDaoTables';
import { detectSchemaDrift } from '../../../scripts/validate-migrations';
import { buildGlobPaths } from '../../database/data-source';
import { Proposal } from '../../dao/entities/proposal.entity';
import { ProposalBalanceSnapshot } from '../../dao/entities/proposal-balance-snapshot.entity';
import { RewardDistribution } from '../../dao/entities/reward-distribution.entity';
import { Vote } from '../../dao/entities/vote.entity';

// ---------------------------------------------------------------------------
// Helpers extracted from validate-migrations.ts (mirrored here for unit testing)
// ---------------------------------------------------------------------------

interface RunResult {
  status: number | null;
  stdout: Buffer | null;
  stderr: Buffer | null;
}

function makeRunner(runImpl: (cmd: string) => RunResult) {
  return function run(command: string): void {
    const result = runImpl(command);
    if (result.status !== 0) {
      throw new Error(
        `Command failed (exit ${result.status ?? 'unknown'}): ${command}`,
      );
    }
  };
}

function makeWaiter(isReady: () => boolean, timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isReady()) return;
  }
  throw new Error('Timed out waiting for PostgreSQL');
}

function countMigrationFilesInDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => /^[0-9].*\.ts$/.test(f)).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migration validation logic', () => {
  // -------------------------------------------------------------------------
  // makeRunner
  // -------------------------------------------------------------------------
  describe('makeRunner', () => {
    it('should not throw when command exits with status 0', () => {
      const run = makeRunner(() => ({
        status: 0,
        stdout: Buffer.from('ok'),
        stderr: null,
      }));
      expect(() => run('some command')).not.toThrow();
    });

    it('should throw when command exits with non-zero status', () => {
      const run = makeRunner(() => ({
        status: 1,
        stdout: null,
        stderr: Buffer.from('error'),
      }));
      expect(() => run('failing command')).toThrow(
        'Command failed (exit 1): failing command',
      );
    });

    it('should throw when command exits with null status', () => {
      const run = makeRunner(() => ({
        status: null,
        stdout: null,
        stderr: null,
      }));
      expect(() => run('null-exit command')).toThrow('exit unknown');
    });
  });

  // -------------------------------------------------------------------------
  // makeWaiter
  // -------------------------------------------------------------------------
  describe('makeWaiter', () => {
    it('should return without error when ready immediately', () => {
      expect(() => makeWaiter(() => true, 1000)).not.toThrow();
    });

    it('should throw when not ready before timeout', () => {
      // Use an extremely short timeout so the test does not hang.
      expect(() => makeWaiter(() => false, 1)).toThrow(
        'Timed out waiting for PostgreSQL',
      );
    });
  });

  // -------------------------------------------------------------------------
  // countMigrationFilesInDir
  // -------------------------------------------------------------------------
  describe('countMigrationFilesInDir', () => {
    it('should return 0 for a non-existent directory', () => {
      const count = countMigrationFilesInDir('/non/existent/path/migrations');
      expect(count).toBe(0);
    });

    it('should count only digit-prefixed .ts migration files', () => {
      const migrationsDir = path.resolve(__dirname, '..');
      const count = countMigrationFilesInDir(migrationsDir);
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should keep spec files out of the migrations directory', () => {
      const migrationsDir = path.resolve(__dirname, '..');
      const specFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.spec.ts'));
      expect(specFiles).toEqual([]);
    });
  });

  describe('empty database validation', () => {
    it('loads digit-prefixed migrations from src/migrations only', () => {
      const { migrations } = buildGlobPaths(
        path.resolve(__dirname, '../../database'),
        '.ts',
      );

      expect(migrations).toEqual([
        expect.stringContaining('src/migrations/[0-9]*.ts'),
      ]);
    });

    it('has a migration for every table used on a fresh database', () => {
      const files = fs.readdirSync(path.resolve(__dirname, '..'));
      const tables = [
        'transactions',
        'currencies',
        'currency_pairs',
        'ledger_entries',
        'fee_records',
        'transaction_reversals',
      ];

      for (const table of tables) {
        expect(files.some((file) => file.toLowerCase().includes(table))).toBe(
          true,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Validation flow (full success path — mocked)
  // -------------------------------------------------------------------------
  describe('validation flow', () => {
    /**
     * Simulates the full validate-migrations.ts flow with mocked Docker and
     * TypeORM CLI commands.
     */
    function runValidationFlow(opts: {
      dockerAvailable: boolean;
      postgresBecamesReady: boolean;
      migrateUpSucceeds: boolean;
      migrateDownSucceeds: boolean;
      migrateUpAgainSucceeds?: boolean;
      schemaDriftDetected?: boolean;
    }): { exitCode: number; errors: string[] } {
      const errors: string[] = [];
      const { migrateUpAgainSucceeds = true, schemaDriftDetected = false } =
        opts;

      // Step 1: check docker
      if (!opts.dockerAvailable) {
        errors.push('Docker CLI not found');
        return { exitCode: 1, errors };
      }

      // Step 2: wait for postgres
      if (!opts.postgresBecamesReady) {
        errors.push('PostgreSQL did not become ready');
        return { exitCode: 1, errors };
      }

      // Step 3: run migrations up
      if (!opts.migrateUpSucceeds) {
        errors.push('migration:run failed');
        return { exitCode: 1, errors };
      }

      // Step 4: revert each migration
      if (!opts.migrateDownSucceeds) {
        errors.push('migration:revert failed');
        return { exitCode: 1, errors };
      }

      if (!migrateUpAgainSucceeds) {
        errors.push('second migration:run failed');
        return { exitCode: 1, errors };
      }

      if (schemaDriftDetected) {
        errors.push('schema drift detected');
        return { exitCode: 1, errors };
      }

      return { exitCode: 0, errors };
    }

    it('should exit 0 when all steps succeed', () => {
      const result = runValidationFlow({
        dockerAvailable: true,
        postgresBecamesReady: true,
        migrateUpSucceeds: true,
        migrateDownSucceeds: true,
      });
      expect(result.exitCode).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should exit 1 when Docker is unavailable', () => {
      const result = runValidationFlow({
        dockerAvailable: false,
        postgresBecamesReady: true,
        migrateUpSucceeds: true,
        migrateDownSucceeds: true,
      });
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toMatch(/Docker/i);
    });

    it('should exit 1 when PostgreSQL does not become ready', () => {
      const result = runValidationFlow({
        dockerAvailable: true,
        postgresBecamesReady: false,
        migrateUpSucceeds: true,
        migrateDownSucceeds: true,
      });
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toMatch(/PostgreSQL/i);
    });

    it('should exit 1 when migration:run fails', () => {
      const result = runValidationFlow({
        dockerAvailable: true,
        postgresBecamesReady: true,
        migrateUpSucceeds: false,
        migrateDownSucceeds: true,
      });
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toMatch(/migration:run/i);
    });

    it('should exit 1 when migration revert fails (cannot roll back)', () => {
      const result = runValidationFlow({
        dockerAvailable: true,
        postgresBecamesReady: true,
        migrateUpSucceeds: true,
        migrateDownSucceeds: false,
      });
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toMatch(/migration:revert/i);
    });

    it('should exit 1 when the second migration:run fails', () => {
      const result = runValidationFlow({
        dockerAvailable: true,
        postgresBecamesReady: true,
        migrateUpSucceeds: true,
        migrateDownSucceeds: true,
        migrateUpAgainSucceeds: false,
      });
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toMatch(/second migration:run/i);
    });

    it('should exit 1 when schema:log reports drift', () => {
      const result = runValidationFlow({
        dockerAvailable: true,
        postgresBecamesReady: true,
        migrateUpSucceeds: true,
        migrateDownSucceeds: true,
        schemaDriftDetected: true,
      });
      expect(result.exitCode).toBe(1);
      expect(result.errors[0]).toMatch(/schema drift/i);
    });
  });

  describe('detectSchemaDrift', () => {
    it('accepts clean schema:log output', () => {
      expect(
        detectSchemaDrift('No changes in database schema were found\n'),
      ).toBe(false);
    });

    it('rejects schema:log output containing SQL', () => {
      expect(
        detectSchemaDrift('ALTER TABLE "users" ADD "newColumn" integer;\n'),
      ).toBe(true);
    });

    it('ignores npm banners and blank lines', () => {
      expect(
        detectSchemaDrift(
          '\n> nexafx-backend@2.0.0 typeorm\n> typeorm-ts-node-commonjs schema:log\n\nNo changes in database schema were found\n',
        ),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Production vs staging rollback behaviour
  // -------------------------------------------------------------------------
  describe('environment rollback policy', () => {
    function applyRollbackPolicy(
      environment: 'staging' | 'production',
      healthCheckPassed: boolean,
    ): { autoRollback: boolean; requiresManualConfirmation: boolean } {
      if (healthCheckPassed) {
        return { autoRollback: false, requiresManualConfirmation: false };
      }
      if (environment === 'staging') {
        return { autoRollback: true, requiresManualConfirmation: false };
      }
      // production
      return { autoRollback: false, requiresManualConfirmation: true };
    }

    it('should NOT auto-rollback staging when health checks pass', () => {
      const policy = applyRollbackPolicy('staging', true);
      expect(policy.autoRollback).toBe(false);
    });

    it('should auto-rollback staging when health checks fail', () => {
      const policy = applyRollbackPolicy('staging', false);
      expect(policy.autoRollback).toBe(true);
      expect(policy.requiresManualConfirmation).toBe(false);
    });

    it('should NOT auto-rollback production when health checks fail', () => {
      const policy = applyRollbackPolicy('production', false);
      expect(policy.autoRollback).toBe(false);
    });

    it('should require manual confirmation for production on failure', () => {
      const policy = applyRollbackPolicy('production', false);
      expect(policy.requiresManualConfirmation).toBe(true);
    });

    it('should NOT require manual confirmation for production when passing', () => {
      const policy = applyRollbackPolicy('production', true);
      expect(policy.requiresManualConfirmation).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// #1323 — conflicting migrations
// ---------------------------------------------------------------------------

describe('AddMissingIndexes1715421500000', () => {
  const migration = new AddMissingIndexes1715421500000();

  it('declares transaction = false so CREATE INDEX CONCURRENTLY is allowed', () => {
    expect(migration.transaction).toBe(false);
  });
});

describe('CreateDaoTables1762500000000', () => {
  it('creates tables and columns declared by all DAO entities', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;

    await new CreateDaoTables1762500000000().up(runner);
    const migrationSql = statements.join('\n');
    const entities = [Proposal, Vote, RewardDistribution, ProposalBalanceSnapshot];
    const metadata = getMetadataArgsStorage();

    for (const entity of entities) {
      const table = metadata.tables.find((entry) => entry.target === entity);
      expect(table).toBeDefined();
      expect(migrationSql).toContain(`"${table?.name}"`);

      const columns = metadata.columns.filter(
        (column) => column.target === entity,
      );
      for (const column of columns) {
        expect(migrationSql).toContain(
          `"${column.options.name ?? column.propertyName}"`,
        );
      }

      for (const index of metadata.indices.filter(
        (entry) => entry.target === entity,
      )) {
        expect(migrationSql).toContain(`"${index.name}"`);
      }

      for (const unique of metadata.uniques.filter(
        (entry) => entry.target === entity,
      )) {
        expect(migrationSql).toContain(`"${unique.name}"`);
      }

      for (const joinColumn of metadata.joinColumns.filter(
        (entry) => entry.target === entity,
      )) {
        if (joinColumn.options?.foreignKeyConstraintName) {
          expect(migrationSql).toContain(
            `"${joinColumn.options.foreignKeyConstraintName}"`,
          );
        }
      }
    }

    expect(migrationSql).toContain('UNIQUE ("proposalId", "voterId")');
    expect(migrationSql).toContain('ON DELETE CASCADE');
  });

  it('drops every DAO table on rollback', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;

    await new CreateDaoTables1762500000000().down(runner);

    for (const table of [
      'proposal_balance_snapshots',
      'reward_distributions',
      'votes',
      'proposals',
    ]) {
      expect(statements.join('\n')).toContain(
        `DROP TABLE IF EXISTS "${table}"`,
      );
    }
  });
});

describe('AddMissingIndexes1715421500000', () => {
  const migration = new AddMissingIndexes1715421500000();

  it('does not reference the non-existent `kyc` table', () => {
    const tables = migration.indexes.map((index) => index.table);

    expect(tables).not.toContain('kyc');
    expect(tables).toContain('kyc_records');
  });

  it('keeps the idx_kyc_user_id index name pointing at kyc_records', () => {
    const kycIndex = migration.indexes.find(
      (index) => index.name === 'idx_kyc_user_id',
    );

    expect(kycIndex).toBeDefined();
    expect(kycIndex?.table).toBe('kyc_records');
    expect(kycIndex?.columns).toBe('"userId"');
  });
});
