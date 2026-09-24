import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { EmailService } from '../auth/email.service';

@Injectable()
export class InvoiceReminderCron {
  private readonly logger = new Logger(InvoiceReminderCron.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly emailService: EmailService,
  ) {}

  @Cron('0 9 * * *') // Execute daily at precisely 09:00 UTC bounds
  async processBillingReminders() {
    this.logger.log('Starting automated invoice lifecycle evaluation cron...');
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Transit pass-due open streams instantly onto OVERDUE lanes
    const overdueInvoices = await this.invoiceRepo.find({
      where: { status: InvoiceStatus.SENT, dueDate: LessThanOrEqual(new Date(todayStr)) },
    });

    for (const inv of overdueInvoices) {
      inv.status = InvoiceStatus.OVERDUE;
      await this.invoiceRepo.save(inv);
      this.logger.log(`Invoice ${inv.invoiceNumber} has passed its due date. Status set to OVERDUE.`);
    }

    // 2. Dispatch reminder emails for invoices due exactly 3 days from now
    const targetReminderDate = new Date();
    targetReminderDate.setDate(targetReminderDate.getDate() + 3);
    const targetReminderStr = targetReminderDate.toISOString().split('T')[0];

    const upcomingInvoices = await this.invoiceRepo.find({
      where: { status: InvoiceStatus.SENT, dueDate: new Date(targetReminderStr) as any },
    });

    for (const inv of upcomingInvoices) {
      const reminderHtml = `<p>Friendly Reminder: Your invoice <b>${inv.invoiceNumber}</b> is due in 3 days (${inv.dueDate}).</p>
                            <p><a href="${inv.paymentUrl}">Settle Payment Now</a></p>`;
      await this.emailService.sendMail(inv.recipientEmail, `Upcoming Invoice Due Reminder: ${inv.invoiceNumber}`, reminderHtml);
    }

    // 3. Process rolling overdue follow-ups (Every 3 days, capped at a maximum of 3 total reminders)
    const activeOverdue = await this.invoiceRepo.find({
      where: { status: InvoiceStatus.OVERDUE, reminderCount: LessThanOrEqual(2) },
    });

    for (const inv of activeOverdue) {
      const daysSinceLast = inv.lastReminderSentAt 
        ? Math.floor((Date.now() - new Date(inv.lastReminderSentAt).getTime()) / (1000 * 60 * 60 * 24))
        : 3; // Default to 3 if it's the first reminder post-overdue flag transition

      if (daysSinceLast >= 3) {
        inv.reminderCount += 1;
        inv.lastReminderSentAt = new Date();
        await this.invoiceRepo.save(inv);

        const followUpHtml = `<p>Urgent Notice: Invoice <b>${inv.invoiceNumber}</b> is past due. Please settle your outstanding balance immediately.</p>
                              <p><a href="${inv.paymentUrl}">Settle Payment Now</a></p>`;
        await this.emailService.sendMail(inv.recipientEmail, `Past Due Follow-up Reminder (${inv.reminderCount}/3): ${inv.invoiceNumber}`, followUpHtml);
      }
    }
    this.logger.log('Invoice automated cron tracking sequence finished successfully.');
  }
}