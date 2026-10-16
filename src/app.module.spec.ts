import { readFileSync } from 'fs';
import { join } from 'path';

describe('AppModule', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(__dirname, ...parts), 'utf8').replace(/\r\n/g, '\n');

  it('registers ScheduleModule.forRoot() at the application root', () => {
    const moduleSource = read('app.module.ts');

    expect(moduleSource).toContain('ScheduleModule.forRoot()');
  });

  it('registers ImpersonationRestrictionGuard as an APP_GUARD after JwtAuthGuard', () => {
    const moduleSource = read('app.module.ts');

    const jwtIndex = moduleSource.indexOf('useClass: JwtAuthGuard');
    const impersonationIndex = moduleSource.indexOf(
      'useClass: ImpersonationRestrictionGuard',
    );

    expect(moduleSource).toContain('ImpersonationRestrictionGuard');
    // Order matters: JwtAuthGuard populates request.user before this runs.
    expect(jwtIndex).toBeGreaterThan(-1);
    expect(impersonationIndex).toBeGreaterThan(jwtIndex);
  });

  it('marks the security-sensitive endpoints with @BlockDuringImpersonation()', () => {
    const authSource = read('auth', 'auth.controller.ts');
    const twoFactorSource = read('two-factor', 'two-factor.controller.ts');
    const usersSource = read('users', 'users.controller.ts');

    const expectMarked = (source: string, route: string): void => {
      expect(source).toContain(route + '\n  @BlockDuringImpersonation()');
    };

    for (const route of [
      "@Post('change-password')",
      "@Post('set-password')",
      "@Post('oauth/unlink')",
    ]) {
      expectMarked(authSource, route);
    }

    for (const route of [
      "@Post('setup')",
      "@Post('confirm')",
      "@Post('disable')",
    ]) {
      expectMarked(twoFactorSource, route);
    }

    for (const route of [
      "@Post('me/data-export')",
      "@Post('me/delete-account')",
    ]) {
      expectMarked(usersSource, route);
    }
  });
});