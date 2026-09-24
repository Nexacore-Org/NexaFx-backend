import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #508 - owasp-zap-dast.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #508.
 */
@Injectable()
export class OwaspZapDastService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #508 - scaffold stub for owasp-zap-dast'
    );
  }
}
