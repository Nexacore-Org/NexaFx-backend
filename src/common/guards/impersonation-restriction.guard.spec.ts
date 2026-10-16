import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  ImpersonationRestrictionGuard,
  BLOCK_IMPERSONATION_KEY,
} from './impersonation-restriction.guard';

describe('ImpersonationRestrictionGuard', () => {
  let guard: ImpersonationRestrictionGuard;
  let reflector: Reflector;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationRestrictionGuard,
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<ImpersonationRestrictionGuard>(
      ImpersonationRestrictionGuard,
    );
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  function createMockContext(opts: {
    isImpersonation: boolean;
    method: string;
    url: string;
  }): ExecutionContext {
    const request = {
      user: opts.isImpersonation
        ? {
            userId: 'user-123',
            isImpersonation: true,
            impersonatedBy: 'admin-123',
          }
        : { userId: 'admin-123', isImpersonation: false },
      method: opts.method,
      url: opts.url,
      originalUrl: opts.url,
    };

    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  function createGraphQLContext(opts: {
    isImpersonation: boolean;
    method: string;
    url: string;
  }): ExecutionContext {
    const inner = createMockContext(opts);
    const request = inner.switchToHttp().getRequest();

    return {
      getType: () => 'graphql',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => inner.switchToHttp(),
      getContext: () => ({ req: request }),
    } as any;
  }

  it('allows normal non-impersonated users to access any endpoint', () => {
    const ctx = createMockContext({
      isImpersonation: false,
      method: 'GET',
      url: '/admin/metrics',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks handlers decorated with @BlockDuringImpersonation() during impersonation', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(true); // block handler
    const ctx = createMockContext({
      isImpersonation: true,
      method: 'GET',
      url: '/profile',
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      BLOCK_IMPERSONATION_KEY,
      expect.any(Array),
    );
  });

  it('blocks admin endpoints during impersonation', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({
      isImpersonation: true,
      method: 'GET',
      url: '/admin/metrics',
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows end impersonation endpoint even under /admin prefix', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({
      isImpersonation: true,
      method: 'POST',
      url: '/admin/impersonate/end',
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks 2FA modifying endpoints during impersonation', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);

    const routes = [
      '/two-factor/setup',
      '/two-factor/confirm',
      '/two-factor/disable',
      '/two-factor/verify',
      '/two-factor/recover',
      '/two-factor/backup-codes/regenerate',
    ];

    for (const route of routes) {
      const ctx = createMockContext({
        isImpersonation: true,
        method: 'POST',
        url: route,
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    }
  });

  it('blocks password change endpoints during impersonation', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);

    const routes = [
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/set-password',
      '/auth/change-password',
    ];

    for (const route of routes) {
      const ctx = createMockContext({
        isImpersonation: true,
        method: 'POST',
        url: route,
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    }
  });

  it('allows GET /two-factor/status during impersonation', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(false);
    const ctx = createMockContext({
      isImpersonation: true,
      method: 'GET',
      url: '/two-factor/status',
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  describe('GraphQL context', () => {
    it('reads the request from the GraphQL execution context', () => {
      mockReflector.getAllAndOverride.mockReturnValueOnce(true);
      const ctx = createGraphQLContext({
        isImpersonation: true,
        method: 'POST',
        url: '/v1/auth/change-password',
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows non-impersonated GraphQL operations', () => {
      const ctx = createGraphQLContext({
        isImpersonation: false,
        method: 'POST',
        url: '/graphql',
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
