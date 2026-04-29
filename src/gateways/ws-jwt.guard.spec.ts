import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from './ws-jwt.guard';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: JwtService;

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
    guard = new WsJwtGuard(jwtService);
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
  });

  describe('valid token', () => {
    it('returns true for a valid token', async () => {
      const payload = { sub: 'user-42', email: 'user@example.com' };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      const client = makeClient('valid.jwt.token');
      const result = await guard.canActivate(makeContext(client));
      expect(result).toBe(true);
    });

    it('stores decoded payload in client.data.user', async () => {
      const payload = { sub: 'user-42', email: 'user@example.com' };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      const client = makeClient('valid.jwt.token');
      await guard.canActivate(makeContext(client));
      expect(client.data.user).toEqual(payload);
    });

    it('does not emit 401 or disconnect on valid token', async () => {
      const payload = { sub: 'user-1' };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      const client = makeClient('valid.jwt.token');
      await guard.canActivate(makeContext(client));
      expect(client.emit).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });
});
