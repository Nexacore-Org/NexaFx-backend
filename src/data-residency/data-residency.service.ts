import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #496 - data-residency.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #496.
 */
@Injectable()
export class DataResidencyService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #496 - scaffold stub for data-residency'
    );
  }
}
