import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';

@Injectable()
export class KycEmailService {
  private readonly logger = new Logger(KycEmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendApprovalEmail(to: string, userName: string): Promise<void> {
    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');
    if (skipEmail === 'true') {
      this.logger.log(`[KYC DEV] Approval email skipped for ${to}`);
      return;
    }

    try {
      const subject = 'Your KYC Verification Has Been Approved';
      const html = this.buildApprovalHtml(userName);
      const text = `Hi ${userName},\n\nYour KYC verification has been approved! You now have full access to higher transaction limits on NexaFX.\n\n- NexaFX Team`;

      await this.sendEmail(to, subject, html, text);
      this.logger.log(`KYC approval email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC approval email to ${to}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async sendRejectionEmail(
    to: string,
    userName: string,
    reason: string,
    canResubmit: boolean,
  ): Promise<void> {
    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');
    if (skipEmail === 'true') {
      this.logger.log(`[KYC DEV] Rejection email skipped for ${to}`);
      return;
    }

    try {
      const subject = canResubmit
        ? 'KYC Resubmission Required'
        : 'KYC Verification Rejected';
      const html = this.buildRejectionHtml(userName, reason, canResubmit);
      const text = canResubmit
        ? `Hi ${userName},\n\nYour KYC submission requires changes before it can be approved.\n\nReason: ${reason}\n\nPlease log in and resubmit your documents.\n\n- NexaFX Team`
        : `Hi ${userName},\n\nYour KYC verification was rejected.\n\nReason: ${reason}\n\n- NexaFX Team`;

      await this.sendEmail(to, subject, html, text);
      this.logger.log(`KYC rejection email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC rejection email to ${to}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private buildApprovalHtml(userName: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff;">
        <div style="background: #27AE60; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">KYC Approved ✅</h2>
          <p style="color: #555; line-height: 1.6;">
            Hi ${userName},
          </p>
          <p style="color: #555; line-height: 1.6;">
            Your identity verification has been approved. You now have full access to higher transaction limits on NexaFX.
          </p>
          <div style="background: #E8F8F0; border: 2px solid #27AE60; border-radius: 12px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; color: #1A7A3A; font-size: 15px;">
              🎉 Your account is now fully verified. Enjoy higher limits!
            </p>
          </div>
          <p style="font-size: 12px; color: #999; text-align: center; margin-top: 32px;">
            © ${new Date().getFullYear()} NexaFX. All rights reserved.
          </p>
        </div>
      </div>
    `;
  }

  private buildRejectionHtml(
    userName: string,
    reason: string,
    canResubmit: boolean,
  ): string {
    const headerColor = canResubmit ? '#F5A623' : '#E74C3C';
    const statusBadge = canResubmit
      ? 'Resubmission Required 🔄'
      : 'Rejected ❌';
    const actionText = canResubmit
      ? 'Please log in to your NexaFX account and resubmit your documents with the requested changes.'
      : 'If you believe this is an error, please contact our support team.';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff;">
        <div style="background: ${headerColor}; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">${statusBadge}</h2>
          <p style="color: #555; line-height: 1.6;">
            Hi ${userName},
          </p>
          <p style="color: #555; line-height: 1.6;">
            Your KYC verification could not be approved at this time.
          </p>
          <div style="background: #FFF0F0; border-left: 3px solid #E74C3C; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #1A1A1A; font-weight: 600;">Reason:</p>
            <p style="margin: 0; color: #555;">${reason}</p>
          </div>
          <p style="color: #555; line-height: 1.6;">
            ${actionText}
          </p>
          <p style="font-size: 12px; color: #999; text-align: center; margin-top: 32px;">
            © ${new Date().getFullYear()} NexaFX. All rights reserved.
          </p>
        </div>
      </div>
    `;
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');
    const fromName =
      this.configService.get<string>('MAILGUN_FROM_NAME') ?? 'NexaFX';

    if (!apiKey || !domain || !fromEmail) {
      throw new Error(
        'Missing Mailgun configuration: MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL are required',
      );
    }

    const mailgun = new Mailgun(FormData);
    const client = mailgun.client({ username: 'api', key: apiKey });

    await client.messages.create(domain, {
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      text,
    });
  }
}
