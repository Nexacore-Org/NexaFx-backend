import { AppDataSource, buildGlobPaths } from './data-source';

function matchesGlob(glob: string, filePath: string): boolean {
  const pattern = glob
    .replace(/\./g, '\\.')
    .replace(/\[0-9\]/g, '[0-9]')
    .replace(/\*/g, '.*');

  return new RegExp(`^${pattern}$`).test(filePath);
}

/**
 * #1325: the CLI data source hardcoded TypeScript-only globs rooted at `src/`,
 * so migrations could not run from the compiled production image (which ships
 * `dist/` and production dependencies only — no `src/`, no ts-node).
 */
describe('data-source glob resolution (#1325)', () => {
  it('uses TypeScript globs when running from src via ts-node', () => {
    expect(buildGlobPaths('/app/src/database', '.ts')).toEqual({
      entities: ['/app/src/**/*.entity.ts'],
      migrations: ['/app/src/migrations/[0-9]*.ts'],
    });
  });

  it('uses JavaScript globs when running from the compiled dist tree', () => {
    expect(buildGlobPaths('/app/dist/database', '.js')).toEqual({
      entities: ['/app/dist/**/*.entity.js'],
      migrations: ['/app/dist/migrations/[0-9]*.js'],
    });
  });

  it('never points at src/ when the CLI runs from dist', () => {
    const { entities, migrations } = buildGlobPaths(
      '/app/dist/database',
      '.js',
    );

    expect(
      [...entities, ...migrations].some((glob) => glob.includes('src/')),
    ).toBe(false);
  });

  it('keeps globs relative to the data-source directory', () => {
    expect(buildGlobPaths('/srv/app/dist/database', '.js').migrations).toEqual([
      '/srv/app/dist/migrations/[0-9]*.js',
    ]);
  });

  it('never matches *.spec.ts in the migrations directory', () => {
    const { migrations } = buildGlobPaths('/app/src/database', '.ts');
    const [glob] = migrations;

    expect(
      matchesGlob(
        glob,
        '/app/src/migrations/20261017001000-DropPasswordHash.ts',
      ),
    ).toBe(true);
    expect(
      matchesGlob(
        glob,
        '/app/src/migrations/20261017001000-DropPasswordHash.spec.ts',
      ),
    ).toBe(false);
    expect(
      matchesGlob(glob, '/app/src/migrations/migration-validation.spec.ts'),
    ).toBe(false);

    const distGlob = buildGlobPaths('/app/dist/database', '.js').migrations[0];
    expect(
      matchesGlob(
        distGlob,
        '/app/dist/migrations/20261017001000-DropPasswordHash.js',
      ),
    ).toBe(true);
    expect(
      matchesGlob(
        distGlob,
        '/app/dist/migrations/20261017001000-DropPasswordHash.spec.js',
      ),
    ).toBe(false);
  });
});

describe('AppDataSource options', () => {
  it('uses only the computed globs for entities and migrations', () => {
    const expected = buildGlobPaths(__dirname, '.ts');

    expect(AppDataSource.options.entities).toEqual(expected.entities);
    expect(AppDataSource.options.migrations).toEqual(expected.migrations);
  });
});
