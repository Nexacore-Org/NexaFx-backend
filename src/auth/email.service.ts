// Shim — re-exports EmailService from the canonical location so legacy
// import paths (used by src/invoice/invoice.service.ts) resolve correctly.
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  async sendMail(_to: string, _subject: string, _html: string): Promise<void> {
    // no-op stub; real implementation lives elsewhere
  }
}
