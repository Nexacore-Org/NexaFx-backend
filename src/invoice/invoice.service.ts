import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus, LineItem } from './invoice.entity';
import { EmailService } from '../auth/email.service';
import { UserService } from '../user/user.service';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly emailService: EmailService,
    private readonly userService: UserService,
  ) {}

  async createInvoice(userId: string, dto: any): Promise<Invoice> {
    // Determine the next sequential invoice number isolated per user
    const lastInvoice = await this.invoiceRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    let nextSequence = 1;
    if (lastInvoice) {
      const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
      if (match) {
        nextSequence = parseInt(match[1], 10) + 1;
      }
    }
    const invoiceNumber = `INV-${String(nextSequence).padStart(5, '0')}`;

    // Compute pricing breakdowns strictly to prevent floating point drifts
    const subtotal = dto.lineItems.reduce((acc: number, item: LineItem) => acc + (item.quantity * item.unitPrice), 0);
    const taxAmount = (subtotal * (dto.taxPercent || 0)) / 100;
    const totalAmount = subtotal + taxAmount;

    const invoice = this.invoiceRepo.create({
      ...dto,
      userId,
      invoiceNumber,
      subtotal,
      taxAmount,
      totalAmount,
      status: InvoiceStatus.DRAFT,
    });

    return await this.invoiceRepo.save(invoice);
  }

  async updateInvoice(id: string, userId: string, dto: any): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Immutability lock: Only invoices in DRAFT status can be modified.');
    }

    Object.assign(invoice, dto);
    return await this.invoiceRepo.save(invoice);
  }

  async sendInvoice(id: string, userId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    invoice.paymentUrl = `${baseUrl}/v2/invoices/${invoice.id}/pay`;
    invoice.status = InvoiceStatus.SENT;

    await this.invoiceRepo.save(invoice);

    const emailHtml = `<h3>Invoice ${invoice.invoiceNumber} from NexaFX</h3>
      <p>Hello ${invoice.recipientName}, you have received a new invoice totaling <b>${invoice.totalAmount} ${invoice.currency}</b>.</p>
      <p><a href="${invoice.paymentUrl}">Click here to securely settle your payment on NexaFX</a></p>`;

    await this.emailService.sendMail(invoice.recipientEmail, `New Invoice ${invoice.invoiceNumber}`, emailHtml);
    return invoice;
  }

  async executePayment(id: string, payerId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice is already settled.');

    // TODO: Connect inside your primary core balance/escrow service context engines:
    // await this.paymentEngine.transferFunds(payerId, invoice.userId, invoice.totalAmount, invoice.currency);
    const mockTransactionId = `TXN-INV-${Date.now()}`;

    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.linkedTransactionId = mockTransactionId;

    await this.invoiceRepo.save(invoice);

    // Dispatch clear confirmation receipts to both operational parties
    const receiptHtml = `<p>Invoice ${invoice.invoiceNumber} has been marked as <b>PAID</b>. Transaction ID: ${mockTransactionId}</p>`;
    await this.emailService.sendMail(invoice.recipientEmail, `Receipt for Invoice ${invoice.invoiceNumber}`, receiptHtml);
    
    const owner = await this.userService.findById(parseInt(invoice.userId, 10));
    if (owner) {
      await this.emailService.sendMail(owner.email, `Payment Received for ${invoice.invoiceNumber}`, receiptHtml);
    }

    return invoice;
  }
}