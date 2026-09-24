/**
 * src/migrations/migration-validation.spec.ts
 *
 * Tests the logic that the migration validation script exercises:
 *  - successful up/down cycle exits 0
 *  - a failed revert causes exit code 1
 *  - Docker unavailability causes exit code 1
 *
 * Since scripts/validate-migrations.ts drives Docker and the TypeORM CLI,
 * we test the business logic by extracting and mocking the helpers.
 */

import * as path from 'path';
import * as fs from 'fs';


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
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')).length;
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
      const count = countMigrationFilesInDir(
        '/non/existent/path/migrations',
      );
      expect(count).toBe(0);
    });

    it('should count only .ts files that are not spec files', () => {
      // Point at the real src/migrations directory
      const migrationsDir = path.resolve(
        __dirname,
        '../../migrations',
      );
      const count = countMigrationFilesInDir(migrationsDir);
      // We have at least 3 migration files (1760, 1761, 1762)
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should not count .spec.ts files as migrations', () => {
      const migrationsDir = path.resolve(
        __dirname,
        '../../migrations',
      );
      if (fs.existsSync(migrationsDir)) {
        const count = countMigrationFilesInDir(migrationsDir);
        const specFiles = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.spec.ts'));
        // spec files in migrations dir should NOT be counted
        const rawCount = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.ts')).length;
        expect(count).toBe(rawCount - specFiles.length);
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
    }): { exitCode: number; errors: string[] } {
      const errors: string[] = [];

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
