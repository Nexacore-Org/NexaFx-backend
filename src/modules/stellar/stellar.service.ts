import { Injectable } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class StellarService {
  async sendPayment(recipient: string, amount: string, network: string) {
    const tracer = trace.getTracer('stellar-service');
    return tracer.startActiveSpan('StellarService.sendPayment', async (span) => {
      try {
        span.setAttributes({
          'stellar.operation': 'payment',
          'stellar.network': network,
          'stellar.recipient': recipient,
          'stellar.amount': amount,
        });

        // ... Existing payment logic execution ...
        
        span.setStatus({ code: SpanStatusCode.OK });
        return { txHash: 'mock_stellar_hash' };
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