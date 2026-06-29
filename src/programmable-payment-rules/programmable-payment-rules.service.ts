import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #494 - programmable-payment-rules.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #494.
 */
@Injectable()
export class ProgrammablePaymentRulesService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #494 - scaffold stub for programmable-payment-rules'
    );
  }
}
