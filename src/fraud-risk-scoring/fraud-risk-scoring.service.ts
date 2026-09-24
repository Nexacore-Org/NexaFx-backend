import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #497 - fraud-risk-scoring.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #497.
 */
@Injectable()
export class FraudRiskScoringService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #497 - scaffold stub for fraud-risk-scoring'
    );
  }
}
