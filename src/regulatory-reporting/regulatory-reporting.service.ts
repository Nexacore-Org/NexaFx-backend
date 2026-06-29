import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #500 - regulatory-reporting.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #500.
 */
@Injectable()
export class RegulatoryReportingService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #500 - scaffold stub for regulatory-reporting'
    );
  }
}
