import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #505 - custom-reports.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #505.
 */
@Injectable()
export class CustomReportsService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #505 - scaffold stub for custom-reports'
    );
  }
}
