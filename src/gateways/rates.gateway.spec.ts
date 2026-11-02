jest.mock('@nestjs/websockets', () => {
  const noop = () => () => undefined;
  return {
    WebSocketGateway: noop,
    WebSocketServer: noop,
    SubscribeMessage: noop,
    MessageBody: noop,
    ConnectedSocket: noop,
    WsException: class WsException extends Error {},
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    TypeOrmModule: {
      forFeature: jest.fn(),
      forRoot: jest.fn(),
    },
  };
});

jest.mock('@nestjs/axios', () => ({
  HttpService: class HttpService {},
}));

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => undefined;
  return {
    ApiTags: noop,
    ApiBearerAuth: noop,
    ApiOperation: noop,
    ApiQuery: noop,
    ApiResponse: noop,
    ApiProperty: noop,
    ApiPropertyOptional: noop,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { RatesGateway } from './rates.gateway';
import { MessagingGateway } from './messaging.gateway';
import { WsJwtGuard, extractWsToken } from './ws-jwt.guard';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';

describe('RatesGateway & MessagingGateway (#1518)', () => {
  let gateway: RatesGateway;
  let messagingGateway: MessagingGateway;
  let wsJwtGuard: WsJwtGuard;
  let service: ExchangeRatesService;
  let jwtService: { verifyAsync: jest.Mock };
  let usersService: { findById: jest.Mock };

  const rateUpdatesSubject = new Subject<any>();

  const mockExchangeRatesService = {
    rateUpdates$: rateUpdatesSubject.asObservable(),
    validateCurrencyPair: jest.fn(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  let mockClient: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockClient = {
      id: 'client-1',
      data: {},
      rooms: new Set(['client-1']),
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      handshake: {
        auth: {
          token: `Bearer ${process.env.TEST_JWT_TOKEN ?? 'test-token'}`,
        },
        headers: {
          authorization: `Bearer ${process.env.TEST_JWT_TOKEN ?? 'test-token'}`,
        },
      },
    };

    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'user1@nexafx.com',
        role: 'USER',
      }),
    };

    usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user1@nexafx.com',
        role: 'USER',
        isSuspended: false,
        isDeleted: false,
        isActive: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatesGateway,
        MessagingGateway,
        WsJwtGuard,
        {
          provide: ExchangeRatesService,
          useValue: mockExchangeRatesService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get<RatesGateway>(RatesGateway);
    messagingGateway = module.get<MessagingGateway>(MessagingGateway);
    wsJwtGuard = module.get<WsJwtGuard>(WsJwtGuard);
    service = module.get<ExchangeRatesService>(ExchangeRatesService);
    gateway.server = mockServer as any;
    messagingGateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
    expect(messagingGateway).toBeDefined();
    expect(wsJwtGuard).toBeDefined();
  });

  describe('connection-time authentication and connection caps (#1518)', () => {
    it('disconnects anonymous sockets without a valid token and does not increment connectionCount', async () => {
      const anonymousClient: any = {
        id: 'anon-1',
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: { auth: {}, headers: {} },
      };

      await gateway.handleConnection(anonymousClient);

      expect(anonymousClient.disconnect).toHaveBeenCalledWith(true);
      expect(gateway.getActiveConnectionCount()).toBe(0);

      // Even if Socket.IO triggers handleDisconnect for the rejected client, count stays 0
      gateway.handleDisconnect(anonymousClient);
      expect(gateway.getActiveConnectionCount()).toBe(0);
    });

    it('rejects sockets with an invalid JWT or suspended user without incrementing connectionCount', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(
        new Error('invalid signature'),
      );

      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
      expect(gateway.getActiveConnectionCount()).toBe(0);

      // Suspended user
      mockClient.disconnect.mockClear();
      usersService.findById.mockResolvedValueOnce({
        id: 'user-1',
        email: 'user1@nexafx.com',
        role: 'USER',
        isSuspended: true,
        isDeleted: false,
        isActive: true,
      });

      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
      expect(gateway.getActiveConnectionCount()).toBe(0);
    });

    it('authenticates valid sockets, strips Bearer prefix, and enforces per-user connection cap', async () => {
      const sockets = Array.from({ length: 6 }, (_, idx) => ({
        id: `sock-${idx + 1}`,
        data: {},
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: {
          auth: { token: 'Bearer valid-jwt-token' },
          headers: {},
        },
      }));

      for (let i = 0; i < 5; i++) {
        await gateway.handleConnection(sockets[i] as any);
        expect(sockets[i].disconnect).not.toHaveBeenCalled();
      }

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-jwt-token');
      expect(gateway.getActiveConnectionCount()).toBe(5);
      expect(gateway.getUserConnectionCount('user-1')).toBe(5);

      // 6th concurrent connection for the same user exceeds MAX_CONNECTIONS_PER_USER (5)
      await gateway.handleConnection(sockets[5] as any);
      expect(sockets[5].disconnect).toHaveBeenCalledWith(true);
      expect(gateway.getActiveConnectionCount()).toBe(5);

      // Disconnecting one authenticated socket frees a slot
      gateway.handleDisconnect(sockets[0] as any);
      expect(gateway.getActiveConnectionCount()).toBe(4);
      expect(gateway.getUserConnectionCount('user-1')).toBe(4);
    });

    it('normalizes Bearer prefix in extractWsToken and WsJwtGuard', async () => {
      expect(
        extractWsToken({
          handshake: { auth: { token: 'Bearer abc.def.ghi' } },
        } as any),
      ).toBe('abc.def.ghi');

      const ctx: any = {
        switchToWs: () => ({
          getClient: () => mockClient,
        }),
      };

      const allowed = await wsJwtGuard.canActivate(ctx);
      expect(allowed).toBe(true);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(
        process.env.TEST_JWT_TOKEN ?? 'test-token',
      );
      expect(mockClient.data.user).toMatchObject({
        userId: 'user-1',
        role: 'USER',
      });
    });

    it('authenticates MessagingGateway connections and rejects anonymous sockets', async () => {
      const anonMsgClient: any = {
        id: 'msg-anon',
        data: {},
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        handshake: { auth: {}, headers: {} },
      };

      await messagingGateway.handleConnection(anonMsgClient);
      expect(anonMsgClient.disconnect).toHaveBeenCalledWith(true);
      expect(anonMsgClient.join).not.toHaveBeenCalled();
      expect(messagingGateway.isUserOnline('user-1')).toBe(false);

      await messagingGateway.handleConnection(mockClient);
      expect(mockClient.join).toHaveBeenCalledWith('user:user-1');
      expect(messagingGateway.isUserOnline('user-1')).toBe(true);
    });
  });

  describe('afterInit', () => {
    it('should subscribe to rate updates and emit to rooms', () => {
      gateway.afterInit();

      const updateData = {
        from: 'XLM',
        to: 'USD',
        rate: 0.5,
        fetchedAt: '2026-03-27T16:00:00Z',
      };

      rateUpdatesSubject.next(updateData);

      expect(mockServer.to).toHaveBeenCalledWith('rate:XLM:USD');
      expect(mockServer.emit).toHaveBeenCalledWith('rate_update', updateData);
    });

    it('should emit payload with exact fields { from, to, rate, fetchedAt }', () => {
      gateway.afterInit();

      const updateData = {
        from: 'BTC',
        to: 'EUR',
        rate: 42000.5,
        fetchedAt: '2026-03-27T17:30:00Z',
      };

      rateUpdatesSubject.next(updateData);

      expect(mockServer.emit).toHaveBeenCalledWith('rate_update', {
        from: 'BTC',
        to: 'EUR',
        rate: 42000.5,
        fetchedAt: '2026-03-27T17:30:00Z',
      });
    });

    it('should not throw error when emitting to empty room', () => {
      gateway.afterInit();

      const updateData = {
        from: 'XLM',
        to: 'JPY',
        rate: 15.25,
        fetchedAt: '2026-03-27T18:00:00Z',
      };

      expect(() => {
        rateUpdatesSubject.next(updateData);
      }).not.toThrow();

      expect(mockServer.to).toHaveBeenCalledWith('rate:XLM:JPY');
      expect(mockServer.emit).toHaveBeenCalledWith('rate_update', updateData);
    });
  });

  describe('handleSubscribe', () => {
    it('should join the client to a room on valid currency pair', async () => {
      mockExchangeRatesService.validateCurrencyPair.mockResolvedValue(
        undefined,
      );

      await gateway.handleSubscribe(mockClient as any, {
        from: 'BTC',
        to: 'USD',
      });

      expect(service.validateCurrencyPair).toHaveBeenCalledWith('BTC', 'USD');
      expect(mockClient.join).toHaveBeenCalledWith('rate:BTC:USD');
    });

    it('should emit an error on invalid currency pair', async () => {
      mockExchangeRatesService.validateCurrencyPair.mockRejectedValue(
        new Error('Invalid'),
      );

      await gateway.handleSubscribe(mockClient as any, {
        from: 'XYZ',
        to: 'ABC',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('error', expect.any(Object));
      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it('should emit error with correct message format for invalid pair', async () => {
      mockExchangeRatesService.validateCurrencyPair.mockRejectedValue(
        new Error('Not found'),
      );

      await gateway.handleSubscribe(mockClient as any, {
        from: 'XYZ',
        to: 'ABC',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid currency pair: XYZ/ABC',
      });
    });

    it('should normalise lowercase currency codes to uppercase before validation and room join', async () => {
      mockExchangeRatesService.validateCurrencyPair.mockResolvedValue(
        undefined,
      );

      await gateway.handleSubscribe(mockClient as any, {
        from: 'xlm',
        to: 'usd',
      });

      expect(service.validateCurrencyPair).toHaveBeenCalledWith('XLM', 'USD');
      expect(mockClient.join).toHaveBeenCalledWith('rate:XLM:USD');
    });

    it('should normalise mixed-case currency codes to uppercase', async () => {
      mockExchangeRatesService.validateCurrencyPair.mockResolvedValue(
        undefined,
      );

      await gateway.handleSubscribe(mockClient as any, {
        from: 'Xlm',
        to: 'Usd',
      });

      expect(service.validateCurrencyPair).toHaveBeenCalledWith('XLM', 'USD');
      expect(mockClient.join).toHaveBeenCalledWith('rate:XLM:USD');
    });

    it('should emit error and not join room when "from" is missing', async () => {
      await gateway.handleSubscribe(mockClient as any, {
        from: '',
        to: 'USD',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('error', {
        message: 'Currency "from" and "to" are required',
      });
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(service.validateCurrencyPair).not.toHaveBeenCalled();
    });

    it('should emit error and not join room when "to" is missing', async () => {
      await gateway.handleSubscribe(mockClient as any, {
        from: 'USD',
        to: '',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('error', {
        message: 'Currency "from" and "to" are required',
      });
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(service.validateCurrencyPair).not.toHaveBeenCalled();
    });

    it('should emit error and not join room when payload is missing both fields', async () => {
      await gateway.handleSubscribe(mockClient as any, {} as any);

      expect(mockClient.emit).toHaveBeenCalledWith('error', {
        message: 'Currency "from" and "to" are required',
      });
      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it('should accept same-currency pair (from === to) as valid', async () => {
      mockExchangeRatesService.validateCurrencyPair.mockResolvedValue(
        undefined,
      );

      await gateway.handleSubscribe(mockClient as any, {
        from: 'USD',
        to: 'USD',
      });

      expect(service.validateCurrencyPair).toHaveBeenCalledWith('USD', 'USD');
      expect(mockClient.join).toHaveBeenCalledWith('rate:USD:USD');
      expect(mockClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleUnsubscribe', () => {
    it('should remove the client from the room', () => {
      gateway.handleUnsubscribe(mockClient as any, { from: 'BTC', to: 'USD' });

      expect(mockClient.leave).toHaveBeenCalledWith('rate:BTC:USD');
    });
  });
});
