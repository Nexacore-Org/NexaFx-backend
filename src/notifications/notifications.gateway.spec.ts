import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { UsersService } from '../users/users.service';
import {
  NotificationsGateway,
  buildWsCorsOptions,
  parseAllowedOrigins,
} from './notifications.gateway';

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: (options?: unknown) => (target: object) => {
    Reflect.defineMetadata('websockets:is_gateway', true, target);
    Reflect.defineMetadata('websockets:gateway_options', options, target);
  },
  WebSocketServer: () => () => undefined,
}));

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;

  const activeUser = {
    id: 'user-101',
    email: 'user@example.com',
    role: 'USER',
    isActive: true,
    isSuspended: false,
    isDeleted: false,
  };

  const makeClient = (token?: string, id = 'socket-1'): Socket =>
    ({
      id,
      handshake: {
        auth: token !== undefined ? { token } : {},
      },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    }) as unknown as Socket;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue(activeUser),
    };
    gateway = new NotificationsGateway(
      jwtService as unknown as JwtService,
      usersService as unknown as UsersService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('handleConnection — user validation', () => {
    it('accepts an active user and joins their notification room', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
      });
      const client = makeClient('Bearer valid.jwt.token');

      await gateway.handleConnection(client);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid.jwt.token');
      expect(usersService.findById).toHaveBeenCalledWith('user-101');
      expect(client.join).toHaveBeenCalledWith('user:user-101');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.user).toMatchObject({
        userId: 'user-101',
        email: 'user@example.com',
        role: 'USER',
      });

      gateway.handleDisconnect(client);
    });

    it('rejects a suspended user socket', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isSuspended: true,
      } as any);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
      });
      const client = makeClient('suspended.jwt.token');

      await gateway.handleConnection(client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects a deleted user socket', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isDeleted: true,
      } as any);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
      });
      const client = makeClient('deleted.jwt.token');

      await gateway.handleConnection(client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects a deactivated user socket', async () => {
      usersService.findById.mockResolvedValue({
        ...activeUser,
        isActive: false,
      } as any);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
      });
      const client = makeClient('inactive.jwt.token');

      await gateway.handleConnection(client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects a partial_auth token without looking up the user', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
        authStage: 'partial_auth',
      });
      const client = makeClient('partial.jwt.token');

      await gateway.handleConnection(client);

      expect(usersService.findById).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects a connection when token is missing', async () => {
      const client = makeClient(undefined);

      await gateway.handleConnection(client);

      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleConnection — token expiry timer', () => {
    it('disconnects the socket when the token exp timestamp passes', async () => {
      jest.useFakeTimers();
      const nowSec = Math.floor(Date.now() / 1000);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
        exp: nowSec + 30,
      });
      const client = makeClient('expiring.jwt.token', 'socket-exp-1');

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:user-101');
      expect(client.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(29_000);
      expect(client.disconnect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1_000);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('clears the expiry timer when the socket disconnects before token expiry', async () => {
      jest.useFakeTimers();
      const nowSec = Math.floor(Date.now() / 1000);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
        exp: nowSec + 60,
      });
      const client = makeClient('early-disconnect.jwt.token', 'socket-exp-2');

      await gateway.handleConnection(client);
      gateway.handleDisconnect(client);

      jest.advanceTimersByTime(120_000);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('immediately rejects a token whose exp has already passed', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-101',
        email: 'user@example.com',
        role: 'USER',
        exp: nowSec - 5,
      });
      const client = makeClient('already-expired.jwt.token', 'socket-exp-3');

      await gateway.handleConnection(client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('WebSocket CORS origin parsing', () => {
    it("allows both origins when ALLOWED_ORIGINS='https://a,https://b'", () => {
      const cors = buildWsCorsOptions('https://a,https://b');

      expect(cors).toEqual({
        origin: ['https://a', 'https://b'],
        credentials: true,
      });
    });

    it('trims whitespace and drops empty segments in ALLOWED_ORIGINS', () => {
      expect(parseAllowedOrigins(' https://a.example.com , , https://b.example.com ')).toEqual([
        'https://a.example.com',
        'https://b.example.com',
      ]);
    });

    it('disables cross-origin access when ALLOWED_ORIGINS is empty or unset', () => {
      expect(buildWsCorsOptions('')).toEqual({
        origin: false,
        credentials: true,
      });
    });
  });
});
