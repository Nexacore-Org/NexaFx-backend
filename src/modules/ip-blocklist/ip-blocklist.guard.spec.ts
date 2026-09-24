import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IpBlocklistGuard } from './ip-blocklist.guard';
import { IpBlocklistService } from './ip-blocklist.service';

function mockContext(req: Partial<{ headers: Record<string, string>; ip?: string; socket?: { remoteAddress?: string } }>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('IpBlocklistGuard', () => {
  let guard: IpBlocklistGuard;
  let service: { isBlocked: jest.Mock };

  beforeEach(() => {
    service = { isBlocked: jest.fn() };
    guard = new IpBlocklistGuard(service as unknown as IpBlocklistService);
  });

  it('allows a request from a clean IP', async () => {
    service.isBlocked.mockResolvedValue(false);
    const ctx = mockContext({ headers: {}, ip: '203.0.113.10' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(service.isBlocked).toHaveBeenCalledWith('203.0.113.10');
  });

  it('blocks a request from a blocklisted IP', async () => {
    service.isBlocked.mockResolvedValue(true);
    const ctx = mockContext({ headers: {}, ip: '198.51.100.7' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/IP address has been blocked/);
  });

  it('uses first X-Forwarded-For hop for proxied requests', async () => {
    service.isBlocked.mockResolvedValue(false);
    const ctx = mockContext({
      headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
      ip: '10.0.0.1',
    });
    await guard.canActivate(ctx);
    expect(service.isBlocked).toHaveBeenCalledWith('203.0.113.50');
  });

  it('falls back to socket.remoteAddress when ip and XFF are absent', async () => {
    service.isBlocked.mockResolvedValue(false);
    const ctx = mockContext({
      headers: {},
      socket: { remoteAddress: '192.0.2.1' },
    });
    await guard.canActivate(ctx);
    expect(service.isBlocked).toHaveBeenCalledWith('192.0.2.1');
  });

  it('allows request when no client IP can be resolved', async () => {
    const ctx = mockContext({ headers: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(service.isBlocked).not.toHaveBeenCalled();
  });

  it('reflects blocklist mutations without restart (add then block)', async () => {
    service.isBlocked.mockResolvedValueOnce(false);
    const cleanCtx = mockContext({ headers: {}, ip: '198.51.100.9' });
    await expect(guard.canActivate(cleanCtx)).resolves.toBe(true);

    service.isBlocked.mockResolvedValueOnce(true);
    await expect(guard.canActivate(cleanCtx)).rejects.toThrow(ForbiddenException);
  });
});
