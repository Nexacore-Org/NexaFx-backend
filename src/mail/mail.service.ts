import { Injectable, Logger } from '@nestjs/common';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs/promises';
import Mailgun from 'mailgun.js';
import formData from 'form-data';

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

interface EmailMessage {
  to: string;
  from: string | { email: string; name: string };
  subject: string;
  text?: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  // Initialize Mailgun client and domain
  private mgClient: any;
  private mailgunDomain: string;

  constructor() {
    this.initializeMailgun();
  }

  private initializeMailgun() {
    // Skip initialization during tests to avoid requiring env variables
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Skipping Mailgun initialization in test environment');
      return;
    }

    // Validate required environment variables for Mailgun
    if (!process.env.MAILGUN_API_KEY) {
      this.logger.error('MAILGUN_API_KEY is required!');
      throw new Error('Mailgun API key is not configured');
    }

    if (!process.env.MAILGUN_DOMAIN) {
      this.logger.error('MAILGUN_DOMAIN is required!');
      throw new Error('Mailgun domain is not configured');
    }

    this.mailgunDomain = process.env.MAILGUN_DOMAIN!;

    const mailgun = new Mailgun(formData);
    this.mgClient = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY!,
      // Allow overriding base URL (e.g., EU region)
      url: process.env.MAILGUN_API_BASE_URL || 'https://api.mailgun.net',
    });

    this.logger.log('Mailgun initialized successfully');
  }

  onModuleInit() {
    // Test Mailgun connection on startup (basic env validation)
    this.testMailgunConnection();
  }

  private testMailgunConnection() {
    try {
      if (process.env.NODE_ENV === 'test') {
        this.logger.log('Skipping Mailgun connection test in test environment');
        return;
      }

      const apiKey = process.env.MAILGUN_API_KEY;
      const domain = process.env.MAILGUN_DOMAIN;

      if (!apiKey || !domain) {
        throw new Error('Mailgun API key or domain is not set');
      }

      // No direct connection test available; ensure API key format looks reasonable
      if (!apiKey.startsWith('key-') && !apiKey.startsWith('MG.')) {
        this.logger.warn(
          'Mailgun API key format not recognized; proceeding anyway',
        );
      }

      this.logger.log('Mailgun connection test passed');
    } catch (error) {
      this.logger.error(
        'Mailgun connection test failed:',
        (error as any).message,
      );
      this.logger.error('Please check your Mailgun configuration');
    }
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    templateName: string;
    context: Record<string, any>;
  }): Promise<boolean> {
    try {
      // Skip sending in test or when explicitly disabled
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.SKIP_EMAIL_SENDING === 'true'
      ) {
        this.logger.warn('Email sending is disabled in this environment');
        return true;
      }

      const templatePath = require('path').join(
        process.cwd(),
        'src/mail/templates',
        `${options.templateName}.ejs`,
      );

      // Check if template exists
      try {
        await require('fs/promises').access(templatePath);
      } catch {
        this.logger.error(`Template file not found: ${templatePath}`);
        return false;
      }

      const template = await require('fs/promises').readFile(
        templatePath,
        'utf8',
      );
      const html = require('ejs').render(template, options.context);

      const fromEmail = process.env.MAILGUN_FROM_EMAIL!;
      const fromName = process.env.MAILGUN_FROM_NAME || 'Your App';

      const result = await this.mgClient.messages.create(this.mailgunDomain, {
        to: [options.to],
        from: `${fromName} <${fromEmail}>`,
        subject: options.subject,
        html,
      });

      this.logger.log(
        `Email sent successfully to ${options.to} with subject: ${options.subject} (id: ${result?.id || 'n/a'})`,
      );

      return true;
    } catch (error) {
      const err: any = error;
      this.logger.error(
        `Failed to send email to ${options.to}: ${err?.message}`,
      );
      if (err?.status || err?.details) {
        this.logger.error(
          `Mailgun error status: ${err.status}, details: ${JSON.stringify(err.details)}`,
        );
      }
      return false;
    }
  }

  async sendOtpEmail(options: {
    to: string;
    otp: string;
    userName?: string;
    expirationMinutes?: number;
  }): Promise<boolean> {
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

  // Method to test email configuration
  async testEmailConfiguration(): Promise<boolean> {
    try {
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.SKIP_EMAIL_SENDING === 'true'
      ) {
        this.logger.log(
          'Skipping real Mailgun send in test/disabled environment',
        );
        return true;
      }

      const testEmail = process.env.MAILGUN_FROM_EMAIL!;
      const fromName = process.env.MAILGUN_FROM_NAME || 'Your App';

      const result = await this.mgClient.messages.create(this.mailgunDomain, {
        to: [testEmail],
        from: `${fromName} <${process.env.MAILGUN_FROM_EMAIL!}>`,
        subject: 'Mailgun Configuration Test',
        html: '<p>This is a test email to verify Mailgun configuration.</p>',
      });

      this.logger.log(
        `Mailgun configuration test passed (id: ${result?.id || 'n/a'})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        'Mailgun configuration test failed:',
        (error as any)?.message,
      );
      return false;
    }
  }

  // Method to send bulk emails (simple sequential sending)
  async sendBulkEmails(
    emails: Array<{
      to: string;
      subject: string;
      templateName: string;
      context: Record<string, any>;
    }>,
  ): Promise<boolean> {
    try {
      for (const emailData of emails) {
        // Skip in test or when disabled
        if (
          process.env.NODE_ENV === 'test' ||
          process.env.SKIP_EMAIL_SENDING === 'true'
        ) {
          continue;
        }
        const templatePath = require('path').join(
          process.cwd(),
          'src/mail/templates',
          `${emailData.templateName}.ejs`,
        );
        const template = await require('fs/promises').readFile(
          templatePath,
          'utf8',
        );
        const html = require('ejs').render(template, emailData.context);

        await this.mgClient.messages.create(this.mailgunDomain, {
          to: [emailData.to],
          from: `${process.env.MAILGUN_FROM_NAME || 'Your App'} <${process.env.MAILGUN_FROM_EMAIL!}>`,
          subject: emailData.subject,
          html,
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to send bulk emails:', (error as any)?.message);
      return false;
    }
  }
}
