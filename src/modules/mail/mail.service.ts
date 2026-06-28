import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { EMAIL_QUEUE } from '../queues/queue.constants';

export interface SendEmailJob {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<SendEmailJob>,
    private readonly configService: ConfigService,
  ) {}

  async enqueueEmail(job: SendEmailJob): Promise<void> {
    try {
      await this.emailQueue.add('send-email', job);
      this.logger.debug(`Queued email to ${String(job.to)}`);
    } catch (error) {
      this.logger.warn(
        `Email queue unavailable; sending inline: ${this.message(error)}`,
      );
      await this.sendNow(job);
    }
  }

  async sendNow(job: SendEmailJob): Promise<void> {
    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');
    if (skipEmail === 'true') {
      this.logger.log(`[EMAIL DEV] Email skipped for ${String(job.to)}`);
      return;
    }

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
      from: job.from ?? `${fromName} <${fromEmail}>`,
      to: Array.isArray(job.to) ? job.to : [job.to],
      subject: job.subject,
      html: job.html,
      text: job.text,
    } as any);
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
