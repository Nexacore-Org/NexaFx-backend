import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #507 - intelligent-sms-routing.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #507.
 */
@Injectable()
export class IntelligentSmsRoutingService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #507 - scaffold stub for intelligent-sms-routing'
    );
  }
}
