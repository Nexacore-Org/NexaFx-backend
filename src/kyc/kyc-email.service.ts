import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { I18nService } from 'nestjs-i18n';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';

@Injectable()
export class KycEmailService {
  private readonly logger = new Logger(KycEmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly i18nService: I18nService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async sendApprovalEmail(to: string, userName: string): Promise<void> {
    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');
    if (skipEmail === 'true') {
      this.logger.log(`[KYC DEV] Approval email skipped for ${to}`);
      return;
    }

    try {
      const user = await this.userRepository.findOne({ where: { email: to } });
      const lang = user?.preferredLanguage || 'en';

      const subject = this.i18nService.translate('emails.APPROVAL_SUBJECT', { lang });
      const text = this.i18nService.translate('emails.APPROVAL_TEXT', { lang, args: { userName } });
      const htmlTitle = this.i18nService.translate('emails.APPROVAL_HTML_TITLE', { lang });
      const htmlBody = this.i18nService.translate('emails.APPROVAL_HTML_BODY', { lang, args: { userName } });
      const htmlBadge = this.i18nService.translate('emails.APPROVAL_HTML_BADGE', { lang });
      const htmlFooter = this.i18nService.translate('emails.FOOTER', { lang, args: { year: new Date().getFullYear() } });

      const html = this.buildTranslatedApprovalHtml(htmlTitle, htmlBody, htmlBadge, htmlFooter);

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
      const user = await this.userRepository.findOne({ where: { email: to } });
      const lang = user?.preferredLanguage || 'en';

      const subject = canResubmit
        ? this.i18nService.translate('emails.RESUBMIT_SUBJECT', { lang })
        : this.i18nService.translate('emails.REJECT_SUBJECT', { lang });

      const text = canResubmit
        ? this.i18nService.translate('emails.RESUBMIT_TEXT', { lang, args: { userName, reason } })
        : this.i18nService.translate('emails.REJECT_TEXT', { lang, args: { userName, reason } });

      const statusBadge = canResubmit
        ? this.i18nService.translate('emails.RESUBMIT_BADGE', { lang })
        : this.i18nService.translate('emails.REJECT_BADGE', { lang });

      const actionText = canResubmit
        ? this.i18nService.translate('emails.RESUBMIT_ACTION', { lang })
        : this.i18nService.translate('emails.REJECT_ACTION', { lang });

      const introText = this.i18nService.translate('emails.REJECT_INTRO', { lang });
      const reasonLabel = this.i18nService.translate('emails.REJECT_REASON', { lang });
      const htmlFooter = this.i18nService.translate('emails.FOOTER', { lang, args: { year: new Date().getFullYear() } });

      const html = this.buildTranslatedRejectionHtml(
        statusBadge,
        actionText,
        introText,
        reasonLabel,
        reason,
        htmlFooter,
        canResubmit,
      );

      await this.sendEmail(to, subject, html, text);
      this.logger.log(`KYC rejection email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send KYC rejection email to ${to}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private buildTranslatedApprovalHtml(
    title: string,
    body: string,
    badge: string,
    footer: string,
  ): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff;">
        <div style="background: #27AE60; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">${title}</h2>
          <p style="color: #555; line-height: 1.6;">
            ${body}
          </p>
          <div style="background: #E8F8F0; border: 2px solid #27AE60; border-radius: 12px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; color: #1A7A3A; font-size: 15px;">
              ${badge}
            </p>
          </div>
          <p style="font-size: 12px; color: #999; text-align: center; margin-top: 32px;">
            ${footer}
          </p>
        </div>
      </div>
    `;
  }

  private buildTranslatedRejectionHtml(
    statusBadge: string,
    actionText: string,
    introText: string,
    reasonLabel: string,
    reason: string,
    footer: string,
    canResubmit: boolean,
  ): string {
    const headerColor = canResubmit ? '#F5A623' : '#E74C3C';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff;">
        <div style="background: ${headerColor}; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">${statusBadge}</h2>
          <p style="color: #555; line-height: 1.6;">
            ${introText}
          </p>
          <div style="background: #FFF0F0; border-left: 3px solid #E74C3C; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #1A1A1A; font-weight: 600;">${reasonLabel}</p>
            <p style="margin: 0; color: #555;">${reason}</p>
          </div>
          <p style="color: #555; line-height: 1.6;">
            ${actionText}
          </p>
          <p style="font-size: 12px; color: #999; text-align: center; margin-top: 32px;">
            ${footer}
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
