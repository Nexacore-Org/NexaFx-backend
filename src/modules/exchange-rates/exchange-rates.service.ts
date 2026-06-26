import { Injectable } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class ExchangeRatesService {
  async getRate(pair: string) {
    const tracer = trace.getTracer('exchange-rates-service');
    return tracer.startActiveSpan('ExchangeRatesService.getRate', async (span) => {
      try {
        // Mocking cache logic step check for demonstration
        const cacheHit = false; 
        
        span.setAttributes({
          'exchange.pair': pair,
          'cache.hit': cacheHit,
        });

        // ... Existing exchange computation logic ...

        span.setStatus({ code: SpanStatusCode.OK });
        return { pair, rate: 1.25 };
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