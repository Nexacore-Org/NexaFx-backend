import { Test, TestingModule } from '@nestjs/testing';
import { CallHandler, ExecutionContext, HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import Decimal from 'decimal.js';
import { BatchesV2Controller } from './batches-v2.controller';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';
import { IdempotencyService } from '../common/services/idempotency.service';
import { TransactionsService } from '../transactions/services/transaction.service';

describe('BatchesV2Controller', () => {
  let controller: BatchesV2Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchesV2Controller],
      providers: [
        {
          provide: TransactionsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<BatchesV2Controller>(BatchesV2Controller);
  });

  it('returns a successful transaction response for the authenticated user', async () => {
    const batchId = 'batch-123';
    const userId = 'user-456';

    const response = await controller.executeBatch(
      batchId,
      { user: { userId } },
      { reference: 'user-note-123' },
    );

    expect(response).toMatchObject({
      id: batchId,
      userId,
      currency: 'XLM',
      status: 'SUCCESS',
    });
    expect(new Decimal(response.amount).isZero()).toBe(true);
    expect(response.createdAt).toBeInstanceOf(Date);
    expect(response.updatedAt).toBeInstanceOf(Date);
  });

  describe('Idempotency-Key enforcement for the v2 endpoint', () => {
    const mockService = {
      validateIdempotencyKey: jest.fn(),
      checkIdempotency: jest.fn(),
      storeIdempotency: jest.fn(),
    };

    const createContext = (
      headers: Record<string, string>,
      routePath = '/v2/batches/:id/execute',
    ) => {
      const response = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      const request = {
        method: 'POST',
        url: '/v2/batches/batch-123/execute',
        route: { path: routePath },
        headers,
        body: { reference: 'test' },
        user: { id: 'user-456' },
      };

      return {
        context: {
          switchToHttp: () => ({
            getRequest: () => request,
            getResponse: () => response,
          }),
        } as unknown as ExecutionContext,
        response,
      };
    };

    const createInterceptor = async () => {
      const module = await Test.createTestingModule({
        providers: [
          IdempotencyInterceptor,
          { provide: IdempotencyService, useValue: mockService },
        ],
      }).compile();

      return module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns 422 when the required key is missing', (done) => {
      const { context } = createContext({});
      createInterceptor().then((interceptor) => {
        interceptor.intercept(context, {} as CallHandler).subscribe({
          error: (error) => {
            expect(error.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
            expect(error.message).toContain('Idempotency-Key');
            done();
          },
        });
      });
    });

    it('passes a valid key through and echoes it in the response header', (done) => {
      const { context, response } = createContext({
        'idempotency-key': 'batch_exec_123',
      });
      mockService.validateIdempotencyKey.mockReturnValue({ valid: true });
      mockService.checkIdempotency.mockResolvedValue(null);

      createInterceptor().then((interceptor) => {
        interceptor
          .intercept(context, {
            handle: () => of({ id: 'batch-123' }),
          } as CallHandler)
          .subscribe({
            next: (body) => {
              expect(body).toEqual({ id: 'batch-123' });
              expect(response.setHeader).toHaveBeenCalledWith(
                'Idempotency-Key',
                'batch_exec_123',
              );
              done();
            },
          });
      });
    });

    it('returns 400 for an invalid key format', (done) => {
      const { context } = createContext({ 'idempotency-key': 'invalid key' });
      mockService.validateIdempotencyKey.mockReturnValue({
        valid: false,
        error: 'invalid key format',
      });

      createInterceptor().then((interceptor) => {
        interceptor.intercept(context, {} as CallHandler).subscribe({
          error: (error) => {
            expect(error.status).toBe(HttpStatus.BAD_REQUEST);
            expect(error.message).toBe('invalid key format');
            done();
          },
        });
      });
    });
  });
});