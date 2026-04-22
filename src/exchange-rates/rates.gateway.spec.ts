import { Test, TestingModule } from '@nestjs/testing';
import { RatesGateway } from './rates.gateway';
import { ExchangeRatesService } from './exchange-rates.service';
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
  });

  describe('handleUnsubscribe', () => {
    it('should remove the client from the room', () => {
      gateway.handleUnsubscribe(mockClient as any, { from: 'BTC', to: 'USD' });

      expect(mockClient.leave).toHaveBeenCalledWith('rate:BTC:USD');
    });
  });
});
