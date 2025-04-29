import { lastValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  it('should call auditService.logAction when user is present', async () => {
    const auditService = { logAction: jest.fn() };
    const interceptor = new AuditInterceptor(auditService as any);

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user1' },
          ip: '192.168.0.1',
          route: { path: '/transfer' },
        }),
      }),
    };

    const callHandler = {
      handle: () => of('response'),
    };

    await lastValueFrom(interceptor.intercept(mockContext, callHandler));
    expect(auditService.logAction).toHaveBeenCalledWith(
      'user1',
      '192.168.0.1',
      '/transfer',
    );
  });
});
