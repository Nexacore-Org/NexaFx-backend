import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const readFromRoot = (file: string): string =>
  readFileSync(join(rootDir, file), 'utf8');

describe('repository configuration', () => {
  describe('docker-compose.yml', () => {
    const compose = readFromRoot('docker-compose.yml');

    it('defines Redis with a healthcheck', () => {
      expect(compose).toMatch(/^\s{2}redis:\s*$/m);
      expect(compose).toContain("test: ['CMD', 'redis-cli', 'ping']");
    });

    it('uses the credentials from .env.example', () => {
      const env = readFromRoot('.env.example');

      expect(env).toContain(
        'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexafx',
      );
      expect(env).toContain('DB_USERNAME=postgres');
      expect(env).toContain('DB_PASSWORD=postgres');
      expect(compose).toContain('POSTGRES_USER: postgres');
      expect(compose).toContain('POSTGRES_PASSWORD: postgres');
      expect(compose).toContain('pg_isready -U postgres');
    });

    it('keeps Jaeger behind the tracing profile', () => {
      expect(compose).toMatch(/jaeger:[\s\S]*?profiles:\s*\n\s*- tracing/);
    });
  });

  describe('scripts/setup-dev.sh', () => {
    const setup = readFromRoot('scripts/setup-dev.sh');

    it('waits for Redis and uses the PostgreSQL credentials', () => {
      expect(setup).toContain('docker-compose exec -T redis redis-cli ping');
      expect(setup).toContain('pg_isready -U postgres');
    });

    it('does not advertise unmounted Swagger docs', () => {
      expect(setup).not.toContain('/api/docs');
    });
  });

  describe('Docker build', () => {
    const dockerfile = readFromRoot('Dockerfile');
    const workflow = readFromRoot('.github/workflows/docker.yml');

    it('copies .npmrc with the manifests in both stages', () => {
      expect(
        dockerfile.match(
          /COPY package\.json package-lock\.json \.npmrc \.\//g,
        ),
      ).toHaveLength(2);
    });

    it('installs production dependencies without lifecycle scripts', () => {
      expect(dockerfile).toContain('npm ci --omit=dev --ignore-scripts');
    });

    it('smoke-tests the built image in CI', () => {
      expect(workflow).toContain('docker run --rm app:');
    });
  });

  describe('README.md', () => {
    const readme = readFromRoot('README.md');

    it('does not document phantom modules or handoff notes', () => {
      expect(readme).not.toMatch(/handsoff/i);
      for (const phantom of [
        'src/graphql-subscriptions/',
        'src/compliance/',
        'src/disputes/',
        'src/donations/',
        'src/splits/',
      ]) {
        expect(readme).not.toContain(phantom);
      }
    });

    it('only references repository paths that exist', () => {
      const paths = Array.from(
        readme.matchAll(
          /`((?:\.\/)?(?:src|test|scripts|docs)\/[A-Za-z0-9._/-]*|\.env\.example|package\.json|package-lock\.json|tsconfig\.json|README\.md)`/g,
        ),
      ).map((match) => String(match[1]).replace(/\/$/, ''));

      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(existsSync(join(rootDir, path))).toBe(true);
      }
    });
  });

  describe('unit test hygiene', () => {
    it('enables jest/no-disabled-tests', () => {
      expect(readFromRoot('eslint.config.mjs')).toContain(
        "'jest/no-disabled-tests': 'error'",
      );
    });

    it('ships the interpolated translation key in every locale', () => {
      for (const lang of ['en', 'fr', 'ar']) {
        const translations = JSON.parse(
          readFromRoot(`src/i18n/${lang}/auth.json`),
        ) as Record<string, string>;
        expect(translations.WELCOME_USER).toContain('{name}');
      }
    });
  });
});
