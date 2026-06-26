import { Injectable } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TransactionsService {
  async create(dto: { type: string; currency: string; amount: number }) {
    const tracer = trace.getTracer('transactions-service');
    return tracer.startActiveSpan('TransactionsService.create', async (span) => {
      try {
        span.setAttributes({
          'transaction.type': dto.type,
          'transaction.currency': dto.currency,
          'transaction.amount': dto.amount,
        });

        // ... Existing creation logic execution ...

        span.setStatus({ code: SpanStatusCode.OK });
        return { id: 'tx_uuid', ...dto };
      } catch (error: any) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}