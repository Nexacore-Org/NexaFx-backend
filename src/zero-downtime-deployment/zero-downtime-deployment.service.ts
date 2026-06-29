import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #504 - zero-downtime-deployment.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #504.
 */
@Injectable()
export class ZeroDowntimeDeploymentService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #504 - scaffold stub for zero-downtime-deployment'
    );
  }
}
