import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from '../services/idempotency.service';
import { MANDATORY_ENDPOINT_PATTERNS } from './idempotency-patterns';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: IdempotencyService;

  const mockCache = {
    store: new Map(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockService = {
    validateIdempotencyKey: jest.fn(),
    checkIdempotency: jest.fn(),
    storeIdempotency: jest.fn(),
  };

  beforeEach(async () => {
    mockCache.store.clear();
    mockCache.get.mockClear();
    mockCache.set.mockClear();
    mockService.validateIdempotencyKey.mockClear();
    mockService.checkIdempotency.mockClear();
    mockService.storeIdempotency.mockClear();

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
    idempotencyService = module.get<IdempotencyService>(IdempotencyService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  const createMockExecutionContext = (
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body: any = {},
    user?: { userId: string },
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

  describe('key validation', () => {
    it('should return 400 for invalid key format (special characters)', (done) => {
      const context = createMockExecutionContext('POST', '/test', {
        'idempotency-key': 'invalid!@#$key',
      });

      mockService.validateIdempotencyKey.mockReturnValue({
        valid: false,
        error:
          'Idempotency-Key must contain only alphanumeric characters, hyphens, and underscores',
      });

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.message).toContain('alphanumeric');
          done();
        },
      });
    });

    it('should return 400 for key exceeding 128 characters', (done) => {
      const context = createMockExecutionContext('POST', '/test', {
        'idempotency-key': 'a'.repeat(129),
      });

      mockService.validateIdempotencyKey.mockReturnValue({
        valid: false,
        error: 'Idempotency-Key must be at most 128 characters',
      });

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.message).toContain('128 characters');
          done();
        },
      });
    });

    it('should pass valid key format (alphanumeric, hyphens, underscores)', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/test',
        { 'idempotency-key': 'valid_key-123' },
        {},
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockResolvedValue(null);

      interceptor
        .intercept(context, {
          handle: () => of({ success: true }),
        } as CallHandler)
        .subscribe({
          next: (data) => {
            expect(data).toEqual({ success: true });
            done();
          },
        });
    });
  });

  describe('mandatory key enforcement', () => {
    it('should return 422 when Idempotency-Key is missing on mandatory endpoint', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        {},
        {},
        { userId: 'user-123' },
      );

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.message).toContain('required');
          expect(err.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
          done();
        },
      });
    });

    it('should pass through normally on non-mandatory endpoints without key', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/transactions/deposit',
        {},
        { amount: 100 },
        { userId: 'user-123' },
      );

      interceptor
        .intercept(context, {
          handle: () => of({ success: true }),
        } as CallHandler)
        .subscribe({
          next: (data) => {
            expect(data).toEqual({ success: true });
            done();
          },
        });
    });
  });

  describe('replay detection', () => {
    it('should return cached response on retry', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'test-key-123' },
        { amount: 100 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockResolvedValue({
        statusCode: 201,
        body: { id: 'tx-123', amount: 100 },
        replayed: true,
      });

      interceptor.intercept(context, {} as CallHandler).subscribe({
        next: (data) => {
          expect(data).toEqual({ id: 'tx-123', amount: 100 });
          done();
        },
      });
    });

    it('should set X-Idempotency-Replayed header on cached response', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'test-key-456' },
        { amount: 200 },
        { id: 'user-456' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockResolvedValue({
        statusCode: 201,
        body: { id: 'tx-456' },
        replayed: true,
      });

      const response = context.switchToHttp().getResponse();

      interceptor.intercept(context, {} as CallHandler).subscribe({
        next: () => {
          expect(response.setHeader).toHaveBeenCalledWith(
            'Idempotency-Key',
            'test-key-456',
          );
          expect(response.setHeader).toHaveBeenCalledWith(
            'X-Idempotency-Replayed',
            'true',
          );
          done();
        },
      });
    });
  });

  describe('conflict detection', () => {
    it('should return 409 when same key is used for different endpoints', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'conflict-key' },
        { data: 'test' },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      const error: any = new Error(
        'Idempotency key already used for a different endpoint',
      );
      error.code = 'IDEMPOTENCY_KEY_CONFLICT';
      mockService.checkIdempotency.mockRejectedValue(error);

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.message).toContain('different endpoint');
          done();
        },
      });
    });
  });

  describe('non-mutating methods', () => {
    it('should pass through GET requests without checking idempotency', (done) => {
      const context = createMockExecutionContext(
        'GET',
        '/transactions',
        { 'idempotency-key': 'any-key' },
        {},
        { userId: 'user-123' },
      );

      interceptor
        .intercept(context, {
          handle: () => of([{ id: 'tx-1' }]),
        } as CallHandler)
        .subscribe({
          next: (data) => {
            expect(data).toEqual([{ id: 'tx-1' }]);
            done();
          },
        });
    });
  });

  describe('request body binding (#1229)', () => {
    it('replays a cached response and flags it in the header', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'key-1' },
        { amount: 10 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockResolvedValue({
        statusCode: 201,
        body: { id: 'tx-1' },
        replayed: true,
      });

      interceptor.intercept(context, {} as CallHandler).subscribe({
        next: (body) => {
          expect(body).toEqual({ id: 'tx-1' });
          const response = context.switchToHttp().getResponse() as {
            setHeader: jest.Mock;
          };
          expect(response.setHeader).toHaveBeenCalledWith(
            'X-Idempotency-Replayed',
            'true',
          );
          expect(mockService.checkIdempotency).toHaveBeenCalledWith(
            'key-1',
            'user-123',
            { amount: 10 },
            expect.any(String),
          );
          done();
        },
        error: done.fail,
      });
    });

    it('stores the request body with the cached entry', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'key-2' },
        { amount: 25 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockResolvedValue(null);

      const next = {
        handle: () => of({ id: 'tx-2' }),
      } as unknown as CallHandler;

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(mockService.storeIdempotency).toHaveBeenCalledWith(
            'key-2',
            'user-123',
            expect.any(String),
            expect.any(Number),
            { id: 'tx-2' },
            { amount: 25 },
          );
          done();
        },
        error: done.fail,
      });
    });

    it('maps a body mismatch to 422', (done) => {
      const context = createMockExecutionContext(
        'POST',
        '/v2/transactions',
        { 'idempotency-key': 'key-3' },
        { amount: 99 },
        { userId: 'user-123' },
      );

      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockRejectedValue(
        Object.assign(new Error('Idempotency key already used with a different request body'), {
          code: 'IDEMPOTENCY_KEY_BODY_MISMATCH',
        }),
      );

      interceptor.intercept(context, {} as CallHandler).subscribe({
        error: (err) => {
          expect(err.getStatus()).toBe(422);
          done();
        },
      });
    });
  });
});
