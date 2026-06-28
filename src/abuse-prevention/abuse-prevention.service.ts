import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #489 - abuse-prevention.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #489.
 */
@Injectable()
export class AbusePreventionService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #489 - scaffold stub for abuse-prevention'
    );
  }
}
