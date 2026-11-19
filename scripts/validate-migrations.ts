/**
 * scripts/validate-migrations.ts
 *
 * Migration rollback safety validator.
 *
 * 1. Starts a temporary PostgreSQL container via the Docker CLI.
 * 2. Executes all pending TypeORM migrations (up).
 * 3. Reverts every applied migration (down), one by one.
 * 4. Re-applies all migrations (up) to verify a clean round trip.
 * 5. Fails if `typeorm schema:log` reports entity/schema drift.
 * 6. Cleans up the container regardless of outcome.
 * 7. Exits 0 on full success, 1 on any failure.
 *
 * Usage:
 *   npm run migration:validate
 *
 * Prerequisites:
 *   - Docker must be running on the host.
 *   - ts-node must be available (dev dependency).
 */

import { execSync, spawnSync, SpawnSyncReturns } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { tmpdir } from 'os';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONTAINER_NAME = `nexafx_validate_${Date.now()}`;
const POSTGRES_IMAGE = 'postgres:15';
const POSTGRES_USER = 'nexafx';
const POSTGRES_PASSWORD = 'nexafx_validate_pw';
const POSTGRES_DB = 'nexafx_validate';
const POSTGRES_PORT = 45432; // ephemeral port — unlikely to conflict

const DATA_SOURCE_PATH = path.resolve(
  __dirname,
  '../src/database/data-source.ts',
);
const SCHEMA_DRIFT_ARTIFACT_PATH = path.join(
  process.env.RUNNER_TEMP || tmpdir(),
  'migration-schema-drift.sql',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`[validate-migrations] ${msg}`);
}

function logError(msg: string): void {
  console.error(`[validate-migrations] ERROR: ${msg}`);
}

/** Run a shell command synchronously, print output, and throw on non-zero exit. */
function run(
  command: string,
  env?: NodeJS.ProcessEnv,
): SpawnSyncReturns<Buffer> {
  log(`> ${command}`);
  const result = spawnSync(command, {
    shell: true,
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });

  const stdout = result.stdout?.toString().trim();
  const stderr = result.stderr?.toString().trim();

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status ?? 'unknown'}): ${command}`,
    );
  }

  return result;
}

function runAndCapture(command: string, env?: NodeJS.ProcessEnv): string {
  log(`> ${command}`);
  const result = spawnSync(command, {
    shell: true,
    stdio: 'pipe',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, ...env },
  });

  const stdout = result.stdout?.toString() ?? '';
  const stderr = result.stderr?.toString() ?? '';

  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status ?? 'unknown'}): ${command}\n${stdout}\n${stderr}`.trim(),
    );
  }

  return stdout;
}

export function detectSchemaDrift(schemaLogOutput: string): boolean {
  const noDriftMessage = /^No changes in database schema were found\.?$/i;

  return schemaLogOutput
    .split(/\r?\n/)
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('>'))
    .some((line) => !noDriftMessage.test(line));
}

/** Check that the Docker CLI is available. */
function checkDockerAvailable(): void {
  const result = spawnSync('docker', ['--version'], { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(
      'Docker CLI not found. Make sure Docker is installed and running.',
    );
  }
  log(`Docker: ${result.stdout?.toString().trim()}`);
}

/** Wait for Postgres to be ready (up to timeoutMs). */
function waitForPostgres(timeoutMs = 30_000): void {
  log('Waiting for PostgreSQL to be ready...');
  const interval = 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        CONTAINER_NAME,
        'pg_isready',
        '-U',
        POSTGRES_USER,
        '-d',
        POSTGRES_DB,
      ],
      { stdio: 'pipe' },
    );

    if (result.status === 0) {
      log('PostgreSQL is ready.');
      return;
    }

    // Sleep synchronously (busy-wait is fine for a short script)
    execSync(`node -e "setTimeout(()=>{},${interval})"`);
  }

  throw new Error(
    `PostgreSQL did not become ready within ${timeoutMs / 1000}s.`,
  );
}

/** Count the number of migration files in src/migrations. */
function countMigrationFiles(): number {
  const migrationsDir = path.resolve(__dirname, '../src/migrations');
  if (!fs.existsSync(migrationsDir)) return 0;
  return fs.readdirSync(migrationsDir).filter((f) => /^[0-9].*\.ts$/.test(f))
    .length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const migrationCount = countMigrationFiles();
  log(`Found ${migrationCount} migration file(s) in src/migrations/`);

  if (migrationCount === 0) {
    log('No migrations to validate. Exiting with success.');
    return;
  }

  // Validate data-source exists
  if (!fs.existsSync(DATA_SOURCE_PATH)) {
    logError(`Data source not found at ${DATA_SOURCE_PATH}`);
    process.exitCode = 1;
    return;
  }

  checkDockerAvailable();

  // Database URL pointing to the temporary container
  const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`;

  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    DATABASE_URL,
  };

  let containerStarted = false;

  try {
    // -----------------------------------------------------------------------
    // 1. Start temporary PostgreSQL container
    // -----------------------------------------------------------------------
    log(`Starting temporary container: ${CONTAINER_NAME}`);
    run(
      `docker run --rm -d ` +
        `--name ${CONTAINER_NAME} ` +
        `-e POSTGRES_USER=${POSTGRES_USER} ` +
        `-e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} ` +
        `-e POSTGRES_DB=${POSTGRES_DB} ` +
        `-p ${POSTGRES_PORT}:5432 ` +
        `${POSTGRES_IMAGE}`,
    );
    containerStarted = true;

    waitForPostgres();

    // -----------------------------------------------------------------------
    // 2. Run all migrations (up)
    // -----------------------------------------------------------------------
    log('Running all migrations (up)...');
    run(
      `npm run typeorm -- migration:run -d ${DATA_SOURCE_PATH}`,
      env,
    );
    log('All migrations applied successfully.');

    // -----------------------------------------------------------------------
    // 3. Revert each migration (down) — one per call until none remain
    // -----------------------------------------------------------------------
    log(`Reverting ${migrationCount} migration(s) (down)...`);
    for (let i = 0; i < migrationCount; i++) {
      log(`Reverting migration ${i + 1} of ${migrationCount}...`);
      run(
        `npm run typeorm -- migration:revert -d ${DATA_SOURCE_PATH}`,
        env,
      );
    }
    log('All migrations reverted successfully.');

    // -----------------------------------------------------------------------
    // 4. Re-apply all migrations (up) to catch residue left by down()
    // -----------------------------------------------------------------------
    log('Re-applying all migrations (up) to verify a clean round trip...');
    run(`npm run typeorm -- migration:run -d ${DATA_SOURCE_PATH}`, env);
    log('All migrations re-applied successfully.');

    // -----------------------------------------------------------------------
    // 5. Fail if the migrated schema does not match the entities
    // -----------------------------------------------------------------------
    log('Checking for entity/schema drift with typeorm schema:log...');
    const schemaLogOutput = runAndCapture(
      `npm run --silent typeorm -- schema:log -d ${DATA_SOURCE_PATH}`,
      env,
    );
    if (detectSchemaDrift(schemaLogOutput)) {
      fs.writeFileSync(SCHEMA_DRIFT_ARTIFACT_PATH, schemaLogOutput, 'utf8');
      logError(
        `Schema drift detected. Drift SQL written to ${SCHEMA_DRIFT_ARTIFACT_PATH}`,
      );
      throw new Error(
        'Entity/schema drift detected: typeorm schema:log reported pending SQL',
      );
    }
    log('No entity/schema drift detected.');

    // -----------------------------------------------------------------------
    // 6. Success
    // -----------------------------------------------------------------------
    log('✅ Migration validation passed — round trip and schema check succeeded.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Migration validation FAILED: ${message}`);
    logError(
      'Fix the migration down(), the second up(), or the entity definitions before merging.',
    );
    process.exitCode = 1;
  } finally {
    // -----------------------------------------------------------------------
    // 7. Always clean up the container
    // -----------------------------------------------------------------------
    if (containerStarted) {
      log(`Stopping and removing container: ${CONTAINER_NAME}`);
      const cleanup = spawnSync(
        'docker',
        ['stop', CONTAINER_NAME],
        { stdio: 'pipe' },
      );
      if (cleanup.status !== 0) {
        console.warn(
          '[validate-migrations] Warning: Could not stop container — it may have already exited.',
        );
      }
    }
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Unexpected error: ${message}`);
    process.exitCode = 1;
  });
}
