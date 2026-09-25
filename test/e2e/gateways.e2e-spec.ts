import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import { createTestApp } from '../helpers/app.helper';
import { setupTestDatabase, teardownTestDatabase } from '../helpers/db.helper';

/**
 * End-to-end coverage for the WebSocket exchange-rate gateway.
 *
 * Exercises the real NestJS module graph (guards, gateway wiring, DI) and a
 * real test database. Only true external boundaries (Stellar Horizon, etc.)
 * are mocked, via the shared app.helper bootstrap.
 */
describe('ExchangeRate Gateway (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwtService: JwtService;
  let validToken: string;

  const openSockets: Socket[] = [];

  const connect = (token?: string): Socket => {
    const socket = io(`${baseUrl}/exchange-rates`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: token ? { token } : {},
    });
    openSockets.push(socket);
    return socket;
  };

  const waitFor = <T>(
    socket: Socket,
    event: string,
    timeoutMs = 2000,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for "${event}"`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? address : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
    jwtService = app.get(JwtService);
    validToken = jwtService.sign({ sub: 'e2e-user', email: 'e2e@example.com' });
  });

  afterEach(() => {
    while (openSockets.length) {
      const socket = openSockets.pop();
      socket?.disconnect();
    }
  });

  afterAll(async () => {
    await app?.close();
    await teardownTestDatabase();
  });

  it('rejects an unauthenticated connection attempt', async () => {
    const socket = connect();
    const error = await waitFor<Error>(socket, 'exception');
    expect(error).toBeDefined();
    expect(socket.connected).toBe(false);
  });

  it('delivers updates only for the subscribed currency pair', async () => {
    const socket = connect(validToken);
    await waitFor(socket, 'connect');

    socket.emit('subscribe', { pair: 'USD/NGN' });
    await waitFor(socket, 'subscribed');

    const received: string[] = [];
    socket.on('rateUpdate', (payload: { pair: string }) =>
      received.push(payload.pair),
    );

    socket.emit('requestRate', { pair: 'USD/NGN' });
    socket.emit('requestRate', { pair: 'EUR/NGN' });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(received).toContain('USD/NGN');
    expect(received).not.toContain('EUR/NGN');
  });

  it('receives a server-side rate update within 2 seconds', async () => {
    const socket = connect(validToken);
    await waitFor(socket, 'connect');

    socket.emit('subscribe', { pair: 'USD/NGN' });
    await waitFor(socket, 'subscribed');

    const startedAt = Date.now();
    const update = await waitFor<{ pair: string }>(socket, 'rateUpdate', 2000);
    const elapsed = Date.now() - startedAt;

    expect(update.pair).toBe('USD/NGN');
    expect(elapsed).toBeLessThan(2000);
  });

  it('re-establishes the subscription after disconnect and reconnect', async () => {
    const first = connect(validToken);
    await waitFor(first, 'connect');
    first.emit('subscribe', { pair: 'USD/NGN' });
    await waitFor(first, 'subscribed');
    first.disconnect();

    const second = connect(validToken);
    await waitFor(second, 'connect');
    second.emit('subscribe', { pair: 'USD/NGN' });
    await waitFor(second, 'subscribed');

    const update = await waitFor<{ pair: string }>(second, 'rateUpdate', 2000);
    expect(update.pair).toBe('USD/NGN');
  });
});
