import { Test, TestingModule } from '@nestjs/testing';
import { RatesGateway } from './rates.gateway';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { of, Subject } from 'rxjs';

describe('RatesGateway', () => {
  let gateway: RatesGateway;
  let service: ExchangeRatesService;

  const rateUpdatesSubject = new Subject<any>();

  const mockExchangeRatesService = {
    rateUpdates$: rateUpdatesSubject.asObservable(),
    validateCurrencyPair: jest.fn(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const mockClient = {
    id: 'client-1',
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    handshake: {
      headers: {
        authorization: 'Bearer token',
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatesGateway,
        {
          provide: ExchangeRatesService,
          useValue: mockExchangeRatesService,
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get<RatesGateway>(RatesGateway);
    service = module.get<ExchangeRatesService>(ExchangeRatesService);
    gateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
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

      // Socket.io's to().emit() silently no-ops when room is empty
      // This test verifies no exception is thrown
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
