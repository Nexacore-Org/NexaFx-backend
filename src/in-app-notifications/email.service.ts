import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
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

  async sendEmail(
    to: string,
    subject: string,
    templateName: string,
    context: any,
  ): Promise<boolean> {
    try {
      const templatePath = path.join(
        process.cwd(),
        'src/notifications/templates',
        `${templateName}.ejs`,
      );
      const template = await fs.readFile(templatePath, 'utf8');
      const html = ejs.render(template, context);

      await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent to ${to} with subject: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}
