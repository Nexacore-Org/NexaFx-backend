import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { UsersService } from '../users/users.service';
import { WsJwtGuard } from './ws-jwt.guard';

// The guard only needs the UsersService DI token; mocking the module keeps this
// spec a true unit test (and avoids loading the whole users/persistence graph).
jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

// @nestjs/websockets ships as ESM-only, which the CommonJS jest runtime cannot
// load. WsException only needs to be an Error carrying the message, so the mock
// keeps the guard's rejection path exercised without a full ESM test setup.
jest.mock('@nestjs/websockets', () => ({
  WsException: class WsException extends Error {},
}));

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: JwtService;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;

  const activeUser = {
    id: 'user-42',
    email: 'user@example.com',
    role: 'USER',
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  };

  const makeClient = (token?: string) => ({
    handshake: {
      auth: token !== undefined ? { token } : {},
    },
    data: {} as Record<string, unknown>,
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  const makeContext = (
    client: ReturnType<typeof makeClient>,
  ): ExecutionContext =>
    ({
      switchToWs: () => ({
        getClient: () => client,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    usersService = { findById: jest.fn().mockResolvedValue(activeUser) };
    guard = new WsJwtGuard(jwtService, usersService as unknown as UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('missing token', () => {
    it('emits 401 event when token is absent', async () => {
      const client = makeClient(undefined);
      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.emit).toHaveBeenCalledWith('401', {
        message: 'Unauthorized',
      });
    });

    it('disconnects the client when token is absent', async () => {
      const client = makeClient(undefined);
      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('throws WsException when token is absent', async () => {
      const client = makeClient(undefined);
      await expect(guard.canActivate(makeContext(client))).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('emits 401 event when token is an empty string', async () => {
      const client = makeClient('');
      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.emit).toHaveBeenCalledWith('401', {
        message: 'Unauthorized',
      });
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('invalid / expired token', () => {
    it('emits 401 event when JwtService rejects the token', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('invalid signature'),
      );
      const client = makeClient('bad.token.here');
      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.emit).toHaveBeenCalledWith('401', {
        message: 'Unauthorized',
      });
    });

    it('disconnects the client when token is invalid', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('jwt expired'),
      );
      const client = makeClient('expired.token');
      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('throws WsException when token is invalid', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('jwt malformed'),
      );
      const client = makeClient('malformed');
      await expect(guard.canActivate(makeContext(client))).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('does not look the user up when the signature is invalid', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('invalid signature'),
      );
      const client = makeClient('bad.token.here');
      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });
  });

  describe('partial_auth token (#1321)', () => {
    it('rejects a token that has not completed two-factor verification', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
        email: 'user@example.com',
        authStage: 'partial_auth',
      });
      const client = makeClient('partial.auth.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.emit).toHaveBeenCalledWith('401', {
        message: 'Unauthorized',
      });
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('does not resolve the user for a partial_auth token', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
        email: 'user@example.com',
        authStage: 'partial_auth',
      });
      const client = makeClient('partial.auth.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('does not attach a user to the socket', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
        authStage: 'partial_auth',
      });
      const client = makeClient('partial.auth.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.data.user).toBeUndefined();
    });
  });

  describe('suspended user (#1321)', () => {
    it('rejects a token belonging to a suspended account', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isSuspended: true,
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
        email: 'user@example.com',
      });
      const client = makeClient('suspended.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.emit).toHaveBeenCalledWith('401', {
        message: 'Unauthorized',
      });
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data.user).toBeUndefined();
    });
  });

  describe('deleted user (#1321)', () => {
    it('rejects a token belonging to a deleted account', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isDeleted: true,
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
      });
      const client = makeClient('deleted.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data.user).toBeUndefined();
    });
  });

  describe('deactivated user (#1321)', () => {
    it('rejects a token belonging to a deactivated account', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
      });
      const client = makeClient('deactivated.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('unknown user (#1321)', () => {
    it('rejects a token whose subject no longer exists', async () => {
      usersService.findById.mockResolvedValue(null);
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'ghost-user',
      });
      const client = makeClient('ghost.token');

      await expect(
        guard.canActivate(makeContext(client)),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('valid token', () => {
    it('returns true for a valid token', async () => {
      const payload = { sub: 'user-42', email: 'user@example.com' };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      const client = makeClient('valid.jwt.token');
      const result = await guard.canActivate(makeContext(client));
      expect(result).toBe(true);
    });

    it('stores the validated user in client.data.user', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
        email: 'user@example.com',
        role: 'USER',
      });
      const client = makeClient('valid.jwt.token');
      await guard.canActivate(makeContext(client));
      expect(client.data.user).toEqual({
        userId: 'user-42',
        email: 'user@example.com',
        role: 'USER',
        authStage: undefined,
        isImpersonation: false,
        impersonatedBy: undefined,
        jti: undefined,
      });
    });

    it('does not emit 401 or disconnect on valid token', async () => {
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-1',
      });
      const client = makeClient('valid.jwt.token');
      await guard.canActivate(makeContext(client));
      expect(client.emit).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('downgrades an impersonation token to the USER role', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        role: 'ADMIN',
      });
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user-42',
        role: 'ADMIN',
        isImpersonation: true,
        impersonatedBy: 'admin-1',
      });
      const client = makeClient('impersonation.token');

      await guard.canActivate(makeContext(client));

      expect(client.data.user).toMatchObject({
        userId: 'user-42',
        role: 'USER',
        isImpersonation: true,
        impersonatedBy: 'admin-1',
      });
    });
  });
});
