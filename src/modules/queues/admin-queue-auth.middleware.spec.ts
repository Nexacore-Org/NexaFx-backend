import { createAdminQueueAuthMiddleware } from './admin-queue-auth.middleware';

describe('createAdminQueueAuthMiddleware', () => {
  const build = (
    env: Record<string, string | undefined>,
    verify: jest.Mock = jest
      .fn()
      .mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' }),
    usersService?: { findById: jest.Mock },
  ) => {
    const configService = {
      get: jest.fn((key: string) => env[key]),
    };
    const jwtService = { verifyAsync: verify };
    const middleware = createAdminQueueAuthMiddleware(
      jwtService as never,
      configService as never,
      usersService as never,
    );
    return { middleware, configService, verify };
  };

  const makeReq = (headers: Record<string, string> = {}) =>
    ({ headers }) as never;
  const makeRes = () => {
    const res = {
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res as never;
  };

  describe('startup configuration validation', () => {
    it('refuses to start when JWT_SECRET is unset and basic auth is not configured', () => {
      expect(() => build({})).toThrow(/JWT_SECRET/);
      expect(() => build({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
    });
  });

  describe('basic auth mode', () => {
    const env = {
      QUEUE_DASHBOARD_USER: 'ops',
      QUEUE_DASHBOARD_PASSWORD: 'letmein',
    };

    it('passes valid credentials through', async () => {
      const { middleware } = build(env);
      const next = jest.fn();
      const res = makeRes();

      await middleware(
        makeReq({
          authorization: `Basic ${Buffer.from('ops:letmein').toString('base64')}`,
        }),
        res,
        next,
      );

      expect(next).toHaveBeenCalled();
    });

    it('rejects a wrong password with 401 and a challenge header', async () => {
      const { middleware } = build(env);
      const next = jest.fn();
      const res = makeRes();

      await middleware(
        makeReq({
          authorization: `Basic ${Buffer.from('ops:nope').toString('base64')}`,
        }),
        res,
        next,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="Queue Dashboard"',
      );
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a missing authorization header', async () => {
      const { middleware } = build(env);
      const next = jest.fn();
      const res = makeRes();

      await middleware(makeReq(), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('bearer token mode', () => {
    const env = { JWT_SECRET: 'test-secret' };

    it('accepts an ADMIN token', async () => {
      const { middleware } = build(env);
      const next = jest.fn();

      await middleware(
        makeReq({ authorization: 'Bearer token' }),
        makeRes(),
        next,
      );

      expect(next).toHaveBeenCalled();
    });

    it('accepts a SUPER_ADMIN token', async () => {
      const verify = jest
        .fn()
        .mockResolvedValue({ sub: 'super-1', role: 'SUPER_ADMIN' });
      const { middleware } = build(env, verify);
      const next = jest.fn();

      await middleware(
        makeReq({ authorization: 'Bearer token' }),
        makeRes(),
        next,
      );

      expect(next).toHaveBeenCalled();
    });

    it('rejects a non-admin role with 403', async () => {
      const verify = jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', role: 'USER' });
      const { middleware } = build(env, verify);
      const next = jest.fn();
      const res = makeRes();

      await middleware(makeReq({ authorization: 'Bearer token' }), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects a partial_auth token with 401', async () => {
      const verify = jest.fn().mockResolvedValue({
        sub: 'admin-1',
        role: 'ADMIN',
        authStage: 'partial_auth',
      });
      const { middleware } = build(env, verify);
      const next = jest.fn();
      const res = makeRes();

      await middleware(makeReq({ authorization: 'Bearer token' }), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects an impersonation token with 401', async () => {
      const verify = jest.fn().mockResolvedValue({
        sub: 'admin-1',
        role: 'ADMIN',
        isImpersonation: true,
      });
      const { middleware } = build(env, verify);
      const next = jest.fn();
      const res = makeRes();

      await middleware(makeReq({ authorization: 'Bearer token' }), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('re-checks admin status via UsersService and rejects suspended or demoted admins', async () => {
      const verify = jest
        .fn()
        .mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
      const usersService = {
        findById: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'admin-1',
            role: 'ADMIN',
            isSuspended: true,
            isDeleted: false,
            isActive: true,
          })
          .mockResolvedValueOnce({
            id: 'admin-1',
            role: 'USER',
            isSuspended: false,
            isDeleted: false,
            isActive: true,
          })
          .mockResolvedValueOnce({
            id: 'admin-1',
            role: 'ADMIN',
            isSuspended: false,
            isDeleted: false,
            isActive: true,
          }),
      };

      const { middleware } = build(env, verify, usersService);

      // 1. Suspended admin -> 401
      const next1 = jest.fn();
      const res1 = makeRes();
      await middleware(makeReq({ authorization: 'Bearer token' }), res1, next1);
      expect(next1).not.toHaveBeenCalled();
      expect(res1.status).toHaveBeenCalledWith(401);

      // 2. Demoted admin (role: USER in DB) -> 403
      const next2 = jest.fn();
      const res2 = makeRes();
      await middleware(makeReq({ authorization: 'Bearer token' }), res2, next2);
      expect(next2).not.toHaveBeenCalled();
      expect(res2.status).toHaveBeenCalledWith(403);

      // 3. Active admin -> passes through
      const next3 = jest.fn();
      const res3 = makeRes();
      await middleware(makeReq({ authorization: 'Bearer token' }), res3, next3);
      expect(next3).toHaveBeenCalled();
    });

    it('rejects an unparsable token with 401', async () => {
      const verify = jest.fn().mockRejectedValue(new Error('bad signature'));
      const { middleware } = build(env, verify);
      const next = jest.fn();
      const res = makeRes();

      await middleware(makeReq({ authorization: 'Bearer token' }), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a non-bearer header with 401', async () => {
      const { middleware } = build(env);
      const next = jest.fn();
      const res = makeRes();

      await middleware(
        makeReq({ authorization: 'Basic ops:letmein' }),
        res,
        next,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('verifies against the configured secret', async () => {
      const { middleware, verify } = build(env);

      await middleware(
        makeReq({ authorization: 'Bearer token' }),
        makeRes(),
        jest.fn(),
      );

      expect(verify).toHaveBeenCalledWith('token', { secret: 'test-secret' });
    });
  });
});
