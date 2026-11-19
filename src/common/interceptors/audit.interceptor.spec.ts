import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { UsersService } from '../../users/users.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit.decorator';

describe('AuditInterceptor', () => {
  const auditLogsService = {
    log: jest.fn().mockRejectedValue(new Error('audit store unavailable')),
  };
  const usersService = { findByEmail: jest.fn() };
  const reflector = {
    get: jest.fn().mockReturnValue('user.login'),
  } as unknown as Reflector;
  const response = { statusCode: 200 };
  const context = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        url: '/v1/auth/login',
        body: { email: 'test@example.com', password: 'secret' },
        params: {},
        user: { userId: 'user-1' },
      }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('logs an audit failure without breaking the response', async () => {
    const interceptor = new AuditInterceptor(
      reflector,
      auditLogsService as unknown as AuditLogsService,
      usersService as unknown as UsersService,
    );

    const result = await firstValueFrom(
      await interceptor.intercept(context, {
        handle: () => of({ id: 'login-1' }),
      } as CallHandler),
    );

    expect(result).toEqual({ id: 'login-1' });
    expect(reflector.get).toHaveBeenCalledWith(
      AUDIT_ACTION_KEY,
      expect.any(Function),
    );
    expect(auditLogsService.log).toHaveBeenCalled();

    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write audit log for user.login'),
    );
  });
});
