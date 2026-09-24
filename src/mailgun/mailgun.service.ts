import { Injectable, Logger } from '@nestjs/common';

export interface SendEmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

@Injectable()
export class MailgunService {
  private readonly logger = new Logger(MailgunService.name);

  async sendEmail(params: SendEmailParams): Promise<any> {
    this.logger.verbose(
      `[MailgunService] sendEmail -> to=${params.to}, subject=${params.subject}`,
    );
    return { id: `mock-${Date.now()}`, message: 'Queued' };
  }
}
