import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #499 - multi-signature-wallets.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #499.
 */
@Injectable()
export class MultiSignatureWalletsService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #499 - scaffold stub for multi-signature-wallets'
    );
  }
}
