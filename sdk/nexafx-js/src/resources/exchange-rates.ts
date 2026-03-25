import type { NexaFxClient } from '../client';
import type { ExchangeRateResponseDto } from '../types';

export class ExchangeRatesResource {
  constructor(private readonly client: NexaFxClient) {}

  async get(from: string, to: string): Promise<ExchangeRateResponseDto> {
    return this.client.request<ExchangeRateResponseDto>(
      'GET',
      '/v1/exchange-rates',
      {
        query: { from, to },
        auth: false,
      },
    );
  }
}
