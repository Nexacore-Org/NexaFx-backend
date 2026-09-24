import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../modules/mail/mail.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailService: MailService) {}

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.mailService.enqueueEmail({ to, subject, html });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to queue email to ${to}: ${msg}`);
      throw error;
    }
  }
}
