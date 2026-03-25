import {
  NexaFxAuthError,
  NexaFxError,
  type NexaFxApiErrorPayload,
  toNexaFxError,
} from './errors';
import { AuthResource } from './resources/auth';
import { ExchangeRatesResource } from './resources/exchange-rates';
import { TransactionsResource } from './resources/transactions';
import { NexaFxWebSocketClient, type WebSocketFactory, type WebSocketLike } from './websocket';

export interface TokenState {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface TokenStore {
  get(): TokenState;
  set(tokens: TokenState): void;
  clear(): void;
}

export interface NexaFxClientOptions {
  baseURL: string;
  apiKey?: string;
  apiKeyHeader?: string;
  accessToken?: string;
  refreshToken?: string;
  fetch?: typeof fetch;
  tokenStore?: TokenStore;
  websocketFactory?: WebSocketFactory;
  websocketURL?: string;
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, unknown>;
  auth?: boolean;
  retryOn401?: boolean;
}

class InMemoryTokenStore implements TokenStore {
  private state: TokenState;

  constructor(state: TokenState = {}) {
    this.state = state;
  }

  get() {
    return this.state;
  }

  set(tokens: TokenState) {
    this.state = tokens;
  }

  clear() {
    this.state = {};
  }
}

export class NexaFxClient {
  readonly options: NexaFxClientOptions;
  readonly auth: AuthResource;
  readonly transactions: TransactionsResource;
  readonly exchangeRates: ExchangeRatesResource;
  readonly websocket: NexaFxWebSocketClient;

  private readonly fetchImpl: typeof fetch;
  private readonly tokenStore: TokenStore;
  private refreshPromise?: Promise<void>;

  constructor(options: NexaFxClientOptions) {
    this.options = options;
    if (options.fetch) {
      this.fetchImpl = options.fetch;
    } else if (typeof globalThis.fetch === 'function') {
      this.fetchImpl = globalThis.fetch.bind(globalThis);
    } else {
      throw new NexaFxError(
        'No fetch implementation is available. Provide `fetch` in NexaFxClientOptions.',
      );
    }

    this.tokenStore =
      options.tokenStore ??
      new InMemoryTokenStore({
        accessToken: options.accessToken,
        refreshToken: options.refreshToken,
      });

    this.auth = new AuthResource(this);
    this.transactions = new TransactionsResource(this);
    this.exchangeRates = new ExchangeRatesResource(this);
    this.websocket = new NexaFxWebSocketClient(this);
  }

  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { retryOn401 = true } = options;
    const response = await this.rawRequest(method, path, options);

    if (response.status === 401 && retryOn401 && this.hasRefreshToken()) {
      await this.refreshAccessToken();
      const retried = await this.rawRequest(method, path, {
        ...options,
        retryOn401: false,
      });

      return this.unwrapResponse<T>(retried);
    }

    return this.unwrapResponse<T>(response);
  }

  setTokens(tokens: TokenState) {
    const current = this.tokenStore.get();
    this.tokenStore.set({
      ...current,
      ...tokens,
    });
  }

  clearTokens() {
    this.tokenStore.clear();
  }

  getAccessToken() {
    const tokens = this.tokenStore.get();
    return tokens.accessToken;
  }

  requireRefreshToken() {
    const tokens = this.tokenStore.get();
    if (!tokens.refreshToken) {
      throw new NexaFxAuthError('No refresh token is available.');
    }

    return tokens.refreshToken;
  }

  createWebSocket(url: string): WebSocketLike {
    if (this.options.websocketFactory) {
      return this.options.websocketFactory(url);
    }

    if (typeof globalThis.WebSocket !== 'function') {
      throw new NexaFxError(
        'No WebSocket implementation is available. Provide websocketFactory.',
      );
    }

    return new globalThis.WebSocket(url);
  }

  private async rawRequest(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    const url = this.buildURL(path, options.query);
    const headers = new Headers();

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    if (options.auth !== false) {
      const token = this.getAccessToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      } else if (this.options.apiKey) {
        headers.set(this.options.apiKeyHeader ?? 'x-api-key', this.options.apiKey);
      }
    }

    return this.fetchImpl(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  private async unwrapResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') || '';
    const retryAfter = response.headers.get('retry-after');
    const parsed = contentType.includes('application/json')
      ? ((await response.json()) as
          | { success?: boolean; data?: T }
          | NexaFxApiErrorPayload)
      : undefined;

    if (!response.ok) {
      throw toNexaFxError(
        response.status,
        parsed as NexaFxApiErrorPayload | undefined,
        retryAfter ? Number(retryAfter) : undefined,
      );
    }

    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed.data as T;
    }

    return parsed as T;
  }

  private buildURL(path: string, query?: Record<string, unknown>) {
    const url = new URL(path, this.ensureTrailingSlash(this.options.baseURL));

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private ensureTrailingSlash(value: string) {
    return value.endsWith('/') ? value : `${value}/`;
  }

  private hasRefreshToken() {
    const tokens = this.tokenStore.get();
    return Boolean(tokens.refreshToken);
  }

  private async refreshAccessToken() {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          await this.auth.refresh();
        } catch (error) {
          this.clearTokens();
          throw error;
        } finally {
          this.refreshPromise = undefined;
        }
      })();
    }

    await this.refreshPromise;
  }
}
