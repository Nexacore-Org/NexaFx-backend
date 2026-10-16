import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * JwtAuthGuard extends passport's AuthGuard('jwt'), so the passport mixin is
 * stubbed here: these tests cover the partial_auth allow-list, not token
 * verification (that belongs to the passport strategy).
 */
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      async canActivate(): Promise<boolean> {
        return true;
      }
    },
}));

import { JwtAuthGuard } from './jwt-auth.guard';
import {
  AllowPartialAuth,
  ALLOW_PARTIAL_AUTH_KEY,
} from '../../auth/decorators/allow-partial-auth.decorator';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

class VerifyRoute {
  @AllowPartialAuth()
  verify(): void {}
}

class OrdinaryRoute {
  list(): void {}
}

const guard = new JwtAuthGuard(new Reflector());

const buildContext = (
  user: Record<string, unknown> | undefined,
  url = '/v1/whatever',
  handler: () => void = new OrdinaryRoute().list,
): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: url, url, user }),
    }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard partial_auth allow-list', () => {
  describe('partial_auth token', () => {
    it('is allowed on a route marked @AllowPartialAuth()', async () => {
      const context = buildContext(
        { authStage: 'partial_auth' },
        '/v1/two-factor/verify',
        new VerifyRoute().verify,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('is allowed regardless of the version prefix', async () => {
      const context = buildContext(
        { authStage: 'partial_auth' },
        '/v2/two-factor/verify',
        new VerifyRoute().verify,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('is rejected with 403 on any other route', async () => {
      const context = buildContext({ authStage: 'partial_auth' }, '/v1/users/me');

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Two-factor verification required to access this resource',
      );
    });

    it('is rejected on the undecorated twin of an allowed route', async () => {
      const context = buildContext(
        { authStage: 'partial_auth' },
        '/v1/two-factor/status',
      );

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('fully authenticated token', () => {
    it('passes through on routes without the decorator', async () => {
      await expect(
        guard.canActivate(buildContext({ userId: 'u1' })),
      ).resolves.toBe(true);
    });

    it('passes through on allowed routes', async () => {
      await expect(
        guard.canActivate(
          buildContext({ userId: 'u1' }, '/v1/two-factor/verify', new VerifyRoute().verify),
        ),
      ).resolves.toBe(true);
    });

    it('passes through when no user is attached', async () => {
      await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(true);
    });
  });

  describe('public routes', () => {
    it('skip the partial_auth check entirely', async () => {
      class PublicRoute {
        login(): void {}
      }
      const handler = PublicRoute.prototype.login;
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

      const context = buildContext(
        { authStage: 'partial_auth' },
        '/v1/auth/login',
        handler,
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('metadata', () => {
    it('is set by @AllowPartialAuth() and absent by default', () => {
      expect(ALLOW_PARTIAL_AUTH_KEY).toBe('allowPartialAuth');
      expect(
        Reflect.getMetadata(ALLOW_PARTIAL_AUTH_KEY, new VerifyRoute().verify),
      ).toBe(true);
      expect(
        Reflect.getMetadata(ALLOW_PARTIAL_AUTH_KEY, new OrdinaryRoute().list),
      ).toBeUndefined();
    });
  });
});