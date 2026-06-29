import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #498 - dashboard-preferences.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #498.
 */
@Injectable()
export class DashboardPreferencesService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #498 - scaffold stub for dashboard-preferences'
    );
  }
}
