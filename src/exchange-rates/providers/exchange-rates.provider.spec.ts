import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import {
  ExchangeRatesProviderClient,
  ExchangeRatesProviderError,
} from './exchange-rates.provider';

describe('ExchangeRatesProviderClient', () => {
  let provider: ExchangeRatesProviderClient;
  const configService = { get: jest.fn() };
  const httpService = { get: jest.fn() };

  beforeEach(() => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'EXCHANGE_RATES_PROVIDER_API_KEY') return undefined;
      return undefined;
    });
    httpService.get.mockReset();
    provider = new ExchangeRatesProviderClient(
      configService as unknown as ConfigService,
      httpService as unknown as HttpService,
    );
  });

  it('fetches a direct CoinGecko rate using the correct default URL', async () => {
    httpService.get.mockReturnValue(
      of({ data: { stellar: { usd: 0.12 } } }),
    );

    await expect(provider.fetchRate('XLM', 'USD')).resolves.toMatchObject({
      rate: 0.12,
      source: 'coingecko',
    });
    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
      { timeout: 5000, headers: {} },
    );
  });

  it('fetches inverse pairs from CoinGecko', async () => {
    httpService.get.mockReturnValue(
      of({ data: { stellar: { usd: 0.5 } } }),
    );

    await expect(provider.fetchRate('USD', 'XLM')).resolves.toMatchObject({
      rate: 2,
      source: 'coingecko-inverse',
    });
  });

  it('fetches fiat pairs using the Stellar bridge', async () => {
    httpService.get.mockReturnValue(
      of({ data: { stellar: { eur: 2, gbp: 3 } } }),
    );

    await expect(provider.fetchRate('EUR', 'GBP')).resolves.toMatchObject({
      rate: 1.5,
      source: 'coingecko-bridge',
    });
  });

  it('sends an optional CoinGecko Demo API key header', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'EXCHANGE_RATES_PROVIDER_API_KEY' ? 'demo-key' : undefined,
    );
    provider = new ExchangeRatesProviderClient(
      configService as unknown as ConfigService,
      httpService as unknown as HttpService,
    );
    httpService.get.mockReturnValue(
      of({ data: { stellar: { usd: 0.12 } } }),
    );

    await provider.fetchRate('XLM', 'USD');

    expect(httpService.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'x-cg-demo-api-key': 'demo-key' },
      }),
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid direct rates: %s',
    async (rate) => {
      httpService.get.mockReturnValue(
        of({ data: { stellar: { usd: rate } } }),
      );

      await expect(provider.fetchRate('XLM', 'USD')).rejects.toBeInstanceOf(
        ExchangeRatesProviderError,
      );
    },
  );

  it('rejects a zero inverse rate', async () => {
    httpService.get.mockReturnValue(
      of({ data: { stellar: { usd: 0 } } }),
    );

    await expect(provider.fetchRate('USD', 'XLM')).rejects.toBeInstanceOf(
      ExchangeRatesProviderError,
    );
  });

  it('rejects invalid values in fiat bridge responses', async () => {
    httpService.get.mockReturnValue(
      of({ data: { stellar: { eur: 0, gbp: 3 } } }),
    );

    await expect(provider.fetchRate('EUR', 'GBP')).rejects.toBeInstanceOf(
      ExchangeRatesProviderError,
    );
  });
});
