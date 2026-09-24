export interface ClientConfig {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

export class NexaReferenceClient {
  constructor(private config: ClientConfig) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.config.getToken();
    const headers = new Headers(options.headers || {});
    
    headers.set('Content-Type', 'application/json');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(`${this.config.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.message || `API request failed with status ${res.status}`);
    }

    return res.json();
  }

  async getManifest(clientVersion: string) {
    return this.request('/v2/mobile-sdk-guide/manifest', {
      headers: { 'x-client-version': clientVersion },
    });
  }
}