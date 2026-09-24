import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #491 - load-testing.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #491.
 */
@Injectable()
export class LoadTestingService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #491 - scaffold stub for load-testing'
    );
  }
}
