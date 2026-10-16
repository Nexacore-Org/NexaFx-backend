import { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  const buildContext = (
    request: Record<string, unknown>,
    type = 'http',
  ): ExecutionContext =>
    ({
      getType: () => type,
      getHandler: () => function handler() {},
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const buildRequest = (body: unknown, requestId = 'req-1') => ({
    method: 'POST',
    url: '/v1/auth/login',
    body,
    headers: { 'x-request-id': requestId },
    get: () => 'jest',
  });

  it('never logs a raw password', async () => {
    const logged: string[] = [];
    const spy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });
    const debug = jest
      .spyOn(console, 'debug')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });

    const interceptor = new LoggingInterceptor();
    await firstValueFrom(
      interceptor.intercept(buildContext(buildRequest({
        email: 'user@example.com',
        password: 'hunter2',
      })), { handle: () => of({ ok: true }) }),
    );

    const output = logged.join('\n');
    expect(output).toContain('"password":"[REDACTED]"');
    expect(output).not.toContain('hunter2');
    expect(output).toContain('user@example.com');

    spy.mockRestore();
    debug.mockRestore();
  });

  it('redacts OTP and TOTP codes in the same line', async () => {
    const logged: string[] = [];
    const spy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });
    const debug = jest
      .spyOn(console, 'debug')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.join(' '));
      });

    const interceptor = new LoggingInterceptor();
    await firstValueFrom(
      interceptor.intercept(buildContext(buildRequest({
        email: 'user@example.com',
        otp: '123456',
        totpCode: '654321',
        refreshToken: 'rt_secret',
      })), { handle: () => of({ ok: true }) }),
    );

    const output = logged.join('\n');
    expect(output).not.toContain('123456');
    expect(output).not.toContain('654321');
    expect(output).not.toContain('rt_secret');
    expect(output.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(3);

    spy.mockRestore();
    debug.mockRestore();
  });

  it('passes graphql operations through without touching the http request', async () => {
    const gqlContext = {
      ...buildContext({}, 'graphql'),
      getContext: () => ({ req: { headers: { 'x-request-id': 'gql-1' } } }),
    } as unknown as ExecutionContext;

    const interceptor = new LoggingInterceptor();
    const next = { handle: jest.fn().mockReturnValue(of({ data: {} })) };

    await firstValueFrom(interceptor.intercept(gqlContext, next));

    expect(next.handle).toHaveBeenCalled();
  });

  it('handles a graphql context without a request', async () => {
    const gqlContext = {
      getType: () => 'graphql',
      getContext: () => ({}),
    } as unknown as ExecutionContext;

    const interceptor = new LoggingInterceptor();
    const next = { handle: jest.fn().mockReturnValue(of({ data: {} })) };

    await expect(
      firstValueFrom(interceptor.intercept(gqlContext, next)),
    ).resolves.toEqual({ data: {} });
  });
});
