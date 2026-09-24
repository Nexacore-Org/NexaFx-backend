import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #506 - stellar-audit-trail.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #506.
 */
@Injectable()
export class StellarAuditTrailService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #506 - scaffold stub for stellar-audit-trail'
    );
  }
}
