import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #503 - rate-alerts-enhancement.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #503.
 */
@Injectable()
export class RateAlertsEnhancementService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #503 - scaffold stub for rate-alerts-enhancement'
    );
  }
}
