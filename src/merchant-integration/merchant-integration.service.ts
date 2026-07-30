import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #495 - merchant-integration.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #495.
 */
@Injectable()
export class MerchantIntegrationService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #495 - scaffold stub for merchant-integration'
    );
  }
}
