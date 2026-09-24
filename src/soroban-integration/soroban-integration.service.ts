import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #486 - soroban-integration.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #486.
 */
@Injectable()
export class SorobanIntegrationService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #486 - scaffold stub for soroban-integration'
    );
  }
}
