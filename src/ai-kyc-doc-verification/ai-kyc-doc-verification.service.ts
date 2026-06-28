import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #493 - ai-kyc-doc-verification.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #493.
 */
@Injectable()
export class AiKycDocVerificationService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #493 - scaffold stub for ai-kyc-doc-verification'
    );
  }
}
