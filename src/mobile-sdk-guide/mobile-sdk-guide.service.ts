import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #490 - mobile-sdk-guide.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #490.
 */
@Injectable()
export class MobileSdkGuideService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #490 - scaffold stub for mobile-sdk-guide'
    );
  }
}
