import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config();

const isProd = process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV === 'development';

/**
 * Resolve the entity/migration globs for the directory the TypeORM CLI is
 * running from.
 *
 * The CLI is launched either through `typeorm-ts-node-commonjs` from `src/`
 * (development) or as a plain Node process against the compiled `dist/` tree
 * (production image, which ships neither `src/` nor `ts-node`). TypeORM matches
 * these globs by extension, so the extension has to follow the running file —
 * hardcoding a TypeScript-only, `src/`-based glob made production migrations
 * impossible.
 */
export function buildGlobPaths(
  databaseDir: string,
  extension: '.ts' | '.js',
): { entities: string[]; migrations: string[] } {
  // Normalise separators: glob matchers expect forward slashes.
  const root = join(databaseDir, '..').split('\\').join('/');

  return {
    entities: [`${root}/**/*.entity${extension}`],
    migrations: [`${root}/migrations/*${extension}`],
  };
}

const extension: '.ts' | '.js' = __filename.endsWith('.js') ? '.js' : '.ts';
const { entities, migrations } = buildGlobPaths(__dirname, extension);

// TypeORM CLI datasource for migrations and CLI commands
// synchronize: false and correct migrations config are set for safety
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false, // Never auto-sync in CLI
  logging: isDev,
  entities,
  migrations,
  extra: {
    max: 10,
    idleTimeoutMillis: 30000,
  },
  ssl: isProd ? { rejectUnauthorized: false } : false,
});
