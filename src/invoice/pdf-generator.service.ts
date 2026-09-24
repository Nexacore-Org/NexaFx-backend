import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './invoice.entity';
import * as PDFDocument from 'pdfkit'; // Standard high performance canvas stream packaging tool
import * as QRCode from 'qrcode';

@Injectable()
export class PdfGeneratorService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async renderBrandedInvoiceBuffer(id: string): Promise<Buffer> {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Target invoice tracking profile record missing.');

    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 50 });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Build out branded layout structures
      doc.fontSize(20).text('NexaFX Invoicing Network Platform', { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(`Invoice Serial Tracking Index: ${invoice.invoiceNumber}`);
      doc.text(`Status: ${invoice.status}`);
      doc.text(`Due Target Timeline: ${invoice.dueDate}`);
      doc.text(`Recipient Metadata Profile: ${invoice.recipientName} (${invoice.recipientEmail})`);
      doc.moveDown(2);

      // Render Line Item Matrix Grid Structure Headlines
      doc.fontSize(14).text('Billed Transaction Line items:', { bold: true });
      doc.moveDown();
      
      for (const item of invoice.lineItems) {
        doc.fontSize(11).text(
          `${item.description}  |  Qty: ${item.quantity}  |  Price: ${item.unitPrice} -> Total: ${item.amount} ${invoice.currency}`
        );
      }
      
      doc.moveDown(2);
      doc.fontSize(12).text(`Subtotal Parameters Baseline: ${invoice.subtotal} ${invoice.currency}`);
      doc.text(`Tax Total Elements (${invoice.taxPercent}%): ${invoice.taxAmount} ${invoice.currency}`);
      doc.fontSize(14).text(`Aggregate Payable Summary Total: ${invoice.totalAmount} ${invoice.currency}`, { bold: true });

      // Embed QR Payment Router Address cleanly to enhance operational speed profiles
      if (invoice.paymentUrl) {
        doc.moveDown(2);
        const qrBuffer = await QRCode.toBuffer(invoice.paymentUrl, { type: 'png', width: 120 });
        doc.image(qrBuffer, { width: 100 });
        doc.fontSize(9).text('Scan unified QR profile matrix code to route payment automatically via portal channels.');
      }

      doc.end();
    });
  }
}