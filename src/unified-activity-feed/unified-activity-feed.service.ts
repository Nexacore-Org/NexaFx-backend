import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #488 - unified-activity-feed.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #488.
 */
@Injectable()
export class UnifiedActivityFeedService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #488 - scaffold stub for unified-activity-feed'
    );
  }
}
