import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  templateName: string;
  context: Record<string, any>;
}

interface SendOtpEmailOptions {
  to: string;
  otp: string;
  userName?: string;
  expirationMinutes?: number;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async onModuleInit() {
    // Verify connection on startup
    await this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified successfully');
    } catch (error) {
      this.logger.error('SMTP connection failed:', error);
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      const templatePath = path.join(
        process.cwd(),
        'src/mail/templates',
        `${options.templateName}.ejs`,
      );

      const template = await fs.readFile(templatePath, 'utf8');
      const html = ejs.render(template, options.context);

      await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
        to: options.to,
        subject: options.subject,
        html,
      });

      this.logger.log(
        `Email sent to ${options.to} with subject: ${options.subject}`,
      );
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to send email to ${options.to}: ${error.message}`,
          error.stack,
        );
      }
      return false;
    }
  }

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<boolean> {
    const context = {
      otp: options.otp,
      userName: options.userName || 'User',
      expirationMinutes: options.expirationMinutes || 10,
      currentYear: new Date().getFullYear(),
      appName: process.env.APP_NAME || 'Your App',
    };

    return this.sendEmail({
      to: options.to,
      subject: 'Your OTP Verification Code',
      templateName: 'otp-email',
      context,
    });
  }

  async sendWelcomeEmail(to: string, userName: string): Promise<boolean> {
    const context = {
      userName,
      currentYear: new Date().getFullYear(),
      appName: process.env.APP_NAME || 'Your App',
      loginUrl: `${process.env.FRONTEND_URL}/login`,
    };

    return this.sendEmail({
      to,
      subject: 'Welcome to Our Platform!',
      templateName: 'welcome-email',
      context,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    userName: string,
  ): Promise<boolean> {
    const context = {
      userName,
      resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
      currentYear: new Date().getFullYear(),
      appName: process.env.APP_NAME || 'Your App',
      expirationMinutes: 30,
    };

    return this.sendEmail({
      to,
      subject: 'Password Reset Request',
      templateName: 'password-reset-email',
      context,
    });
  }
}
