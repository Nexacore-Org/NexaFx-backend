import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from '../services/idempotency.service';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  const mockService = {
    validateIdempotencyKey: jest.fn(),
    beginIdempotency: jest.fn(),
    storeIdempotency: jest.fn(),
    releaseIdempotency: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService.releaseIdempotency.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        {
          provide: IdempotencyService,
          useValue: mockService,
        },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
  });

  const createMockExecutionContext = (
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body: any = {},
    user?: { userId?: string; id?: string },
  ): ExecutionContext => {
    const mockRequest = {
      method,
      url,
      headers,
      body,
      user,
      route: { path: url },
    };
    const mockResponse = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getType: () => 'http',
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('key validation', () => {
    it('should return 400 for invalid key format', (done) => {
      const context = createMockExecutionContext('POST', '/test', {
        'idempotency-key': 'invalid!@#$key',
      });
      mockService.validateIdempotencyKey.mockReturnValue({
        valid: false,
        error: 'Idempotency-Key must contain only alphanumeric characters, hyphens, and underscores',
      });

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.status || err.getStatus?.()).toBe(HttpStatus.BAD_REQUEST);
          done();
        },
      });
    });
  });

  describe('mandatory key enforcement', () => {
    it('should return 422 when missing on mandatory endpoint', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        {},
        {},
        { userId: 'user-123' },
      );

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
          done();
        },
      });
    });
  });

  describe('replay detection', () => {
    it('should return cached response and replay header', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'test-key-123' },
        { amount: 100 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.beginIdempotency.mockResolvedValue({
        state: 'replay',
        statusCode: 201,
        body: { id: 'tx-123' },
        replayed: true,
      });

      const response = context.switchToHttp().getResponse();
      interceptor.intercept(context, {} as CallHandler).subscribe({
        next: (data) => {
          expect(data).toEqual({ id: 'tx-123' });
          expect(response.setHeader).toHaveBeenCalledWith(
            'X-Idempotency-Replayed',
            'true',
          );
          done();
        },
        error: done,
      });
    });
  });

  describe('conflict detection', () => {
    it('should return 409 when same key is used concurrently/in progress', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'conflict-key' },
        { data: 'test' },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      const error: any = new Error('Idempotent request is already in progress');
      error.status = HttpStatus.CONFLICT;
      error.getStatus = () => HttpStatus.CONFLICT;
      mockService.beginIdempotency.mockRejectedValue(error);

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.getStatus ? err.getStatus() : err.status).toBe(
            HttpStatus.CONFLICT,
          );
          done();
        },
      });
    });
  });

  describe('request body binding and storage', () => {
    it('waits for idempotency storage before emitting the response', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'await-key' },
        { amount: 10 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.beginIdempotency.mockResolvedValue({ state: 'proceed' });
      let resolveStore: () => void = () => undefined;
      mockService.storeIdempotency.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveStore = resolve;
        }),
      );

      const emitted: unknown[] = [];
      interceptor
        .intercept(context, {
          handle: () => of({ id: 'tx-await' }),
        } as CallHandler)
        .subscribe({
          next: (data) => emitted.push(data),
          error: done,
          complete: () => {
            expect(emitted).toEqual([{ id: 'tx-await' }]);
            expect(mockService.storeIdempotency).toHaveBeenCalled();
            done();
          },
        });

      expect(emitted).toEqual([]);
      resolveStore();
    });

    it('propagates storage failure to the caller', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'reject-key' },
        { amount: 10 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.beginIdempotency.mockResolvedValue({ state: 'proceed' });
      mockService.storeIdempotency.mockRejectedValue(new Error('cache down'));

      interceptor
        .intercept(context, {
          handle: () => of({ id: 'tx-reject' }),
        } as CallHandler)
        .subscribe({
          next: () => done('response emitted despite storage failure'),
          error: (error) => {
            expect(error.message).toBe('cache down');
            done();
          },
        });
    });

    it('releases reservation on handler error', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'rel-key' },
        { amount: 10 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.beginIdempotency.mockResolvedValue({ state: 'proceed' });
      mockService.releaseIdempotency.mockResolvedValue(undefined);

      interceptor
        .intercept(context, {
          handle: () => throwError(() => new Error('boom')),
        } as CallHandler)
        .subscribe({
          error: () => {
            expect(mockService.releaseIdempotency).toHaveBeenCalledWith(
              'rel-key',
              'user-123',
            );
            done();
          },
        });
    });
  });
});
