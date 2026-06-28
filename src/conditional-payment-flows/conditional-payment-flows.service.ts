import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #487 - conditional-payment-flows.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #487.
 */
@Injectable()
export class ConditionalPaymentFlowsService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #487 - scaffold stub for conditional-payment-flows'
    );
  }
}
