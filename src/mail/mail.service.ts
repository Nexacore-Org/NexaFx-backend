import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs/promises';

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

  constructor() {
    this.initializeSendGrid();
  }

  private initializeSendGrid() {
    // Log environment variables for debugging (without exposing sensitive data)
    // this.logger.debug('Environment variables:', {
    //   SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? '***SET***' : 'NOT SET',
    //   SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
    //   SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME,
    //   NODE_ENV: process.env.NODE_ENV,
    // });

    // Validate required environment variables
    if (!process.env.SENDGRID_API_KEY) {
      this.logger.error('SENDGRID_API_KEY is required!');
      throw new Error('SendGrid API key is not configured');
    }

    if (!process.env.SENDGRID_FROM_EMAIL) {
      this.logger.error('SENDGRID_FROM_EMAIL is required!');
      throw new Error('SendGrid from email is not configured');
    }

    // Initialize SendGrid with API key
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Uncomment the line below if you are sending mail using a regional EU subuser
    // sgMail.setDataResidency('eu');

    this.logger.log('SendGrid initialized successfully');
  }

  onModuleInit() {
    // Test SendGrid connection on startup
    this.testSendGridConnection();
  }

  private testSendGridConnection() {
    try {
      // SendGrid doesn't have a direct connection test, so we'll validate the API key format
      const apiKey = process.env.SENDGRID_API_KEY;

      if (!apiKey) {
        throw new Error('SendGrid API key is not set');
      }

      if (!apiKey.startsWith('SG.')) {
        throw new Error('Invalid SendGrid API key format');
      }

      this.logger.log('SendGrid connection test passed');
    } catch (error) {
      this.logger.error('SendGrid connection test failed:', error.message);
      this.logger.error('Please check your SendGrid configuration');
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      // In development, you can still send emails but with additional logging
      // if (process.env.NODE_ENV === 'development') {
      //   this.logger.log(`📧 Sending email in ${process.env.NODE_ENV} mode`);
      //   this.logger.log(`To: ${options.to}`);
      //   this.logger.log(`Subject: ${options.subject}`);
      //   this.logger.log(`Template: ${options.templateName}`);
      // }

      // If you want to skip email sending in development, uncomment this:
      // if (process.env.NODE_ENV === 'development' && process.env.SKIP_EMAIL_SENDING === 'true') {
      //   this.logger.warn('🚧 Email sending is disabled in development mode');
      //   return true;
      // }

      const templatePath = path.join(
        process.cwd(),
        'src/mail/templates',
        `${options.templateName}.ejs`,
      );

      // Check if template exists
      try {
        await fs.access(templatePath);
      } catch {
        this.logger.error(`Template file not found: ${templatePath}`);
        return false;
      }

      const template = await fs.readFile(templatePath, 'utf8');
      const html = ejs.render(template, options.context);

      const msg: EmailMessage = {
        to: options.to,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL!,
          name: process.env.SENDGRID_FROM_NAME || 'Your App',
        },
        subject: options.subject,
        html,
      };

      const result = await sgMail.send(msg);

      this.logger.log(
        `Email sent successfully to ${options.to} with subject: ${options.subject}`,
      );

      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(`SendGrid response status: ${result[0].statusCode}`);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${error.message}`,
      );

      // Log additional debugging information
      if (error.response) {
        this.logger.error(`SendGrid error response:`, error.response.body);
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

  // Method to test email configuration
  async testEmailConfiguration(): Promise<boolean> {
    try {
      // Test by attempting to send a test email to yourself
      const testEmail = process.env.SENDGRID_FROM_EMAIL!;

      const msg: EmailMessage = {
        to: testEmail,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL!,
          name: process.env.SENDGRID_FROM_NAME || 'Your App',
        },
        subject: 'SendGrid Configuration Test',
        html: '<p>This is a test email to verify SendGrid configuration.</p>',
      };

      await sgMail.send(msg);
      this.logger.log('SendGrid configuration test passed');
      return true;
    } catch (error) {
      this.logger.error('SendGrid configuration test failed:', error.message);
      return false;
    }
  }

  // Method to send bulk emails (useful for newsletters, notifications)
  async sendBulkEmails(
    emails: Array<{
      to: string;
      subject: string;
      templateName: string;
      context: Record<string, any>;
    }>,
  ): Promise<boolean> {
    try {
      const messages: EmailMessage[] = [];

      for (const emailData of emails) {
        const templatePath = path.join(
          process.cwd(),
          'src/mail/templates',
          `${emailData.templateName}.ejs`,
        );

        const template = await fs.readFile(templatePath, 'utf8');
        const html = ejs.render(template, emailData.context);

        messages.push({
          to: emailData.to,
          from: {
            email: process.env.SENDGRID_FROM_EMAIL!,
            name: process.env.SENDGRID_FROM_NAME || 'Your App',
          },
          subject: emailData.subject,
          html,
        });
      }

      await sgMail.send(messages);
      this.logger.log(
        `Bulk emails sent successfully to ${emails.length} recipients`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send bulk emails: ${error.message}`);
      return false;
    }
  }

  //   const msg: EmailMessage = {
  //   to: 'nexacore.org@gmail.com', // Change to your recipient
  //   from: 'nexacore.org@gmail.com', // Change to your verified sender
  //   subject: 'Sending with SendGrid is Fun',
  //   text: 'and easy to do anywhere, even with Node.js',
  //   html: '<strong>and easy to do anywhere, even with Node.js</strong>',
  // };

  // async function sendTestEmail(): Promise<void> {
  //   try {
  //     await sgMail.send(msg);
  //     console.log('Email sent successfully');
  //   } catch (error) {
  //     console.error('Error sending email:', error);

  //     // More detailed error logging
  //     if (error.response) {
  //       console.error('SendGrid error response:', error.response.body);
  //     }
  //   }
  // }

  // // Execute the function
  // void sendTestEmail();
}
