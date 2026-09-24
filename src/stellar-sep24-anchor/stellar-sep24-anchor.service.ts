import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #509 - stellar-sep24-anchor.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #509.
 */
@Injectable()
export class StellarSep24AnchorService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #509 - scaffold stub for stellar-sep24-anchor'
    );
  }
}
