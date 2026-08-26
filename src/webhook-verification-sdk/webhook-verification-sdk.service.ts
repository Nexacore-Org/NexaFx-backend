import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #502 - webhook-verification-sdk.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #502.
 */
@Injectable()
export class WebhookVerificationSdkService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #502 - scaffold stub for webhook-verification-sdk'
    );
  }
}
