import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #501 - platform-health-runbook.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #501.
 */
@Injectable()
export class PlatformHealthRunbookService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #501 - scaffold stub for platform-health-runbook'
    );
  }
}
