import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { OtpType } from '../../otps/otp.entity';

interface SendOtpParams {
  email: string;
  type: OtpType;
  otp: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(params: SendOtpParams): Promise<void> {
    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');

    if (skipEmail === 'true') {
      this.logger.log(
        `[OTP DEV] Email skipped — ${params.type} OTP for ${params.email}: ${params.otp}`,
      );
      return;
    }

    try {
      const template = this.buildTemplate(params.type, params.otp);
      await this.sendEmail(params.email, template);
      this.logger.log(
        `[OTP] ${params.type} email sent successfully to ${params.email}`,
      );
    } catch (error) {
      // Log but do not throw — email failure must never crash the auth flow
      this.logger.error(
        `[OTP] Failed to send ${params.type} email to ${params.email}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private buildTemplate(type: OtpType, otp: string): EmailTemplate {
    const expiry = '10 minutes';

    const baseStyles = `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 480px;
      margin: 0 auto;
      background: #ffffff;
    `;

    const codeBlock = `
      <div style="background: #FFF8E7; border: 2px solid #F5A623; border-radius: 12px;
                  text-align: center; padding: 24px; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #666; text-transform: uppercase;
                  letter-spacing: 1px;">Your verification code</p>
        <p style="margin: 0; font-size: 40px; font-weight: 700; letter-spacing: 10px;
                  color: #1A1A1A;">${otp}</p>
        <p style="margin: 8px 0 0; font-size: 12px; color: #999;">
          Expires in ${expiry}
        </p>
      </div>
    `;

    const footer = `
      <p style="font-size: 12px; color: #999; text-align: center; margin-top: 32px;">
        If you did not request this, please ignore this email.<br/>
        This code is confidential — do not share it with anyone.
      </p>
      <p style="font-size: 12px; color: #ccc; text-align: center;">
        © ${new Date().getFullYear()} NexaFX. All rights reserved.
      </p>
    `;

    const templates: Record<OtpType, EmailTemplate> = {
      [OtpType.SIGNUP]: {
        subject: 'Verify your NexaFX account',
        html: `
          <div style="${baseStyles}">
            <div style="background: #F5A623; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">Welcome to NexaFX 👋</h2>
              <p style="color: #555; line-height: 1.6;">
                Thanks for signing up. Use the code below to verify your account.
              </p>
              ${codeBlock}
              ${footer}
            </div>
          </div>
        `,
        text: `Welcome to NexaFX!\n\nYour signup verification code is: ${otp}\n\nThis code expires in ${expiry}.\n\nIf you did not sign up for NexaFX, please ignore this email.`,
      },

      [OtpType.LOGIN]: {
        subject: 'Your NexaFX login code',
        html: `
          <div style="${baseStyles}">
            <div style="background: #F5A623; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">Login verification</h2>
              <p style="color: #555; line-height: 1.6;">
                A login attempt was made to your NexaFX account. Use the code below to continue.
              </p>
              ${codeBlock}
              <p style="color: #e74c3c; font-size: 13px; background: #FFF0F0; padding: 12px;
                         border-radius: 8px; border-left: 3px solid #e74c3c;">
                ⚠️ If you did not attempt to log in, change your password immediately.
              </p>
              ${footer}
            </div>
          </div>
        `,
        text: `NexaFX Login Code\n\nYour login verification code is: ${otp}\n\nThis code expires in ${expiry}.\n\nIf you did not attempt to log in, please secure your account immediately.`,
      },

      [OtpType.PASSWORD_RESET]: {
        subject: 'Reset your NexaFX password',
        html: `
          <div style="${baseStyles}">
            <div style="background: #F5A623; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">Password reset request</h2>
              <p style="color: #555; line-height: 1.6;">
                We received a request to reset your NexaFX password. Use the code below to proceed.
              </p>
              ${codeBlock}
              <p style="color: #e74c3c; font-size: 13px; background: #FFF0F0; padding: 12px;
                         border-radius: 8px; border-left: 3px solid #e74c3c;">
                ⚠️ If you did not request a password reset, your account may be at risk.
                Contact support immediately.
              </p>
              ${footer}
            </div>
          </div>
        `,
        text: `NexaFX Password Reset\n\nYour password reset code is: ${otp}\n\nThis code expires in ${expiry}.\n\nIf you did not request a password reset, please secure your account immediately.`,
      },
    };

    return templates[type];
  }

  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
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
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }
}
