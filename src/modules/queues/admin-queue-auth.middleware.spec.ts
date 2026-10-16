import { createAdminQueueAuthMiddleware } from './admin-queue-auth.middleware';

describe('createAdminQueueAuthMiddleware', () => {
  const build = (
    env: Record<string, string | undefined>,
    verify: jest.Mock = jest.fn().mockResolvedValue({ role: 'ADMIN' }),
  ) => {
    const configService = {
      get: jest.fn((key: string) => env[key]),
    };
    const jwtService = { verifyAsync: verify };
    const middleware = createAdminQueueAuthMiddleware(
      jwtService as never,
      configService as never,
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
      const verify = jest.fn().mockResolvedValue({ role: 'SUPER_ADMIN' });
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
      const verify = jest.fn().mockResolvedValue({ role: 'USER' });
      const { middleware } = build(env, verify);
      const next = jest.fn();
      const res = makeRes();

      await middleware(makeReq({ authorization: 'Bearer token' }), res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
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

      await middleware(makeReq({ authorization: 'Basic ops:letmein' }), res, next);

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