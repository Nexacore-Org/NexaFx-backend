import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AdminQueueAuthMiddleware } from './admin-queue-auth.middleware';
import { Request, Response, NextFunction } from 'express';

describe('AdminQueueAuthMiddleware', () => {
  let middleware: AdminQueueAuthMiddleware;
  let mockConfigService: ConfigService;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'QUEUE_DASHBOARD_USER') return 'admin';
        if (key === 'QUEUE_DASHBOARD_PASSWORD') return 'supersecret123';
        return null;
      }),
    } as unknown as ConfigService;

    middleware = new AdminQueueAuthMiddleware(mockConfigService);

    mockRes = {
      setHeader: jest.fn(),
    };

    nextFn = jest.fn();
  });

  it('should accept request and call next() when valid credentials provided in Basic Auth header', () => {
    const validHeader = 'Basic ' + Buffer.from('admin:supersecret123').toString('base64');
    mockReq = {
      headers: {
        authorization: validHeader,
      },
    };

    middleware.use(mockReq as Request, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('should reject with 401 and set WWW-Authenticate header when Authorization header is missing', () => {
    mockReq = {
      headers: {},
    };

    expect(() => {
      middleware.use(mockReq as Request, mockRes as Response, nextFn);
    }).toThrow(UnauthorizedException);

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="Queue Dashboard"',
    );
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should reject with 401 when Authorization header does not start with Basic', () => {
    mockReq = {
      headers: {
        authorization: 'Bearer somejwttoken',
      },
    };

    expect(() => {
      middleware.use(mockReq as Request, mockRes as Response, nextFn);
    }).toThrow(UnauthorizedException);

    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should reject with 401 when username or password does not match configured credentials', () => {
    const wrongCredentials =
      'Basic ' + Buffer.from('admin:wrongpassword').toString('base64');
    mockReq = {
      headers: {
        authorization: wrongCredentials,
      },
    };

    expect(() => {
      middleware.use(mockReq as Request, mockRes as Response, nextFn);
    }).toThrow(UnauthorizedException);

    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should never be silently permissive if environment credentials are not configured', () => {
    const emptyConfigService = {
      get: jest.fn(() => null),
    } as unknown as ConfigService;

    const unconfiguredMiddleware = new AdminQueueAuthMiddleware(emptyConfigService);
    const validHeader = 'Basic ' + Buffer.from('admin:supersecret123').toString('base64');
    mockReq = {
      headers: {
        authorization: validHeader,
      },
    };

    expect(() => {
      unconfiguredMiddleware.use(mockReq as Request, mockRes as Response, nextFn);
    }).toThrow(UnauthorizedException);

    expect(nextFn).not.toHaveBeenCalled();
  });
});
