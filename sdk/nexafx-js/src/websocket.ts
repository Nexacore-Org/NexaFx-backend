import type { NexaFxClient } from './client';
import { NexaFxAuthError } from './errors';
import type { PriceUpdate } from './types';

export interface WebSocketLike {
  close(code?: number, reason?: string): void;
  send(data: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export class NexaFxWebSocketClient {
  constructor(private readonly client: NexaFxClient) {}

  subscribeToPrices(
    symbols: string[],
    onUpdate: (update: PriceUpdate) => void,
  ): () => void {
    const token = this.client.getAccessToken();
    if (!token) {
      throw new NexaFxAuthError(
        'A JWT access token is required for price subscriptions.',
      );
    }

    const socket = this.client.createWebSocket(this.buildURL(token));

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          channel: 'prices',
          symbols,
        }),
      );
    };

    socket.onmessage = (event) => {
      const parsed = this.parseMessage(event.data);
      if (parsed && symbols.includes(parsed.symbol)) {
        onUpdate(parsed);
      }
    };

    return () => socket.close(1000, 'client unsubscribe');
  }

  private buildURL(token: string): string {
    const rawBase =
      this.client.options.websocketURL || this.client.options.baseURL;
    const url = new URL(rawBase);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/prices';
    url.searchParams.set('access_token', token);

    return url.toString();
  }

  private parseMessage(data: string): PriceUpdate | null {
    try {
      const payload = JSON.parse(data) as
        | PriceUpdate
        | { data?: PriceUpdate; type?: string };

      if ('symbol' in payload && 'bid' in payload && 'ask' in payload) {
        return payload;
      }

      if (payload.data && 'symbol' in payload.data) {
        return payload.data;
      }
    } catch {
      return null;
    }

    return null;
  }
}
