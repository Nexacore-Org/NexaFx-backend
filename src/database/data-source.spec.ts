import { buildGlobPaths } from './data-source';

/**
 * #1325: the CLI data source hardcoded TypeScript-only globs rooted at `src/`,
 * so migrations could not run from the compiled production image (which ships
 * `dist/` and production dependencies only — no `src/`, no ts-node).
 */
describe('data-source glob resolution (#1325)', () => {
  it('uses TypeScript globs when running from src via ts-node', () => {
    expect(buildGlobPaths('/app/src/database', '.ts')).toEqual({
      entities: ['/app/src/**/*.entity.ts'],
      migrations: ['/app/src/migrations/*.ts'],
    });
  });

  it('uses JavaScript globs when running from the compiled dist tree', () => {
    expect(buildGlobPaths('/app/dist/database', '.js')).toEqual({
      entities: ['/app/dist/**/*.entity.js'],
      migrations: ['/app/dist/migrations/*.js'],
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
      '/srv/app/dist/migrations/*.js',
    ]);
  });
});
