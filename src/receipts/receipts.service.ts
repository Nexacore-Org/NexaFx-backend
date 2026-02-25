import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import PDFDocument from 'pdfkit';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a PDF receipt for a specific transaction
   */
  async generateTransactionReceipt(
    transactionId: string,
    userId: string,
  ): Promise<Buffer> {
    // Fetch transaction and validate ownership
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId, userId },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found or access denied');
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Set up PDF
      doc.fontSize(20).text('NexaFX Transaction Receipt', { align: 'center' });
      doc.moveDown();

      // Transaction details
      doc.fontSize(12).text('Transaction Details:', { underline: true });
      doc.fontSize(10);
      doc.text(`Transaction ID: ${transaction.id}`);
      doc.text(`Reference Number: NFX-${transaction.id.slice(-8).toUpperCase()}`);
      doc.text(`Type: ${transaction.type}`);
      doc.text(`Status: ${transaction.status}`);
      doc.text(`Date: ${transaction.createdAt.toLocaleDateString()}`);
      doc.moveDown();

      // Amount details
      doc.fontSize(12).text('Amount Details:', { underline: true });
      doc.fontSize(10);
      doc.text(`Amount: ${transaction.amount} ${transaction.currency}`);
      if (transaction.rate && transaction.type === TransactionType.DEPOSIT) {
        doc.text(`Exchange Rate: ${transaction.rate}`);
        // Calculate converted amount (assuming USD as base)
        const convertedAmount = parseFloat(transaction.amount) * parseFloat(transaction.rate);
        doc.text(`Converted Amount: ${convertedAmount.toFixed(2)} USD`);
      }
      doc.moveDown();

      // Wallet details
      doc.fontSize(12).text('Wallet Information:', { underline: true });
      doc.fontSize(10);
      if (transaction.txHash) {
        doc.text(`Stellar Transaction Hash: ${transaction.txHash}`);
        doc.text(`Explorer Link: https://stellar.expert/explorer/testnet/tx/${transaction.txHash}`);
        doc.text('Scan the QR code or visit the link to verify on blockchain');
      }
      doc.moveDown();

      // User information
      doc.fontSize(12).text('Account Information:', { underline: true });
      doc.fontSize(10);
      doc.text(`Account Holder: ${transaction.user.email}`);
      doc.moveDown();

      // Footer
      doc.fontSize(8).text('This is an electronically generated receipt.', { align: 'center' });
      doc.text('For any inquiries, contact support@nexafx.com', { align: 'center' });

      doc.end();
    });
  }

  /**
   * Generate a monthly statement PDF
   */
  async generateMonthlyStatement(
    userId: string,
    month: string, // Format: YYYY-MM
  ): Promise<Buffer> {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Fetch transactions for the month
    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        } as any,
      },
      order: { createdAt: 'ASC' },
      relations: ['user'],
    });

    if (transactions.length === 0) {
      throw new NotFoundException('No transactions found for the specified period');
    }

    const user = await this.usersService.findOne(userId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('NexaFX Monthly Statement', { align: 'center' });
      doc.fontSize(12).text(`Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, { align: 'center' });
      doc.moveDown();

      // Account Information
      doc.fontSize(12).text('Account Information:', { underline: true });
      doc.fontSize(10);
      doc.text(`Account Holder: ${user?.email || 'N/A'}`);
      doc.text(`Statement Period: ${month}`);
      doc.moveDown();

      // Summary
      const deposits = transactions.filter(t => t.type === TransactionType.DEPOSIT && t.status === TransactionStatus.SUCCESS);
      const withdrawals = transactions.filter(t => t.type === TransactionType.WITHDRAW && t.status === TransactionStatus.SUCCESS);
      
      const totalDeposits = deposits.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const totalWithdrawals = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const netChange = totalDeposits - totalWithdrawals;

      doc.fontSize(12).text('Account Summary:', { underline: true });
      doc.fontSize(10);
      doc.text(`Total Deposits: ${totalDeposits.toFixed(2)} USD`);
      doc.text(`Total Withdrawals: ${totalWithdrawals.toFixed(2)} USD`);
      doc.text(`Net Change: ${netChange.toFixed(2)} USD`);
      doc.moveDown();

      // Transaction Table
      doc.fontSize(12).text('Transaction Details:', { underline: true });
      doc.fontSize(9);

      let yPosition = doc.y;
      const tableTop = yPosition;
      const rowHeight = 20;
      const colWidths = {
        date: 80,
        type: 60,
        amount: 80,
        status: 70,
        reference: 100,
      };

      // Table headers
      doc.text('Date', 50, yPosition);
      doc.text('Type', 130, yPosition);
      doc.text('Amount', 190, yPosition);
      doc.text('Status', 270, yPosition);
      doc.text('Reference', 340, yPosition);
      yPosition += rowHeight;

      // Table rows
      transactions.forEach((transaction) => {
        if (yPosition > 700) { // Add new page if needed
          doc.addPage();
          yPosition = 50;
        }

        doc.text(transaction.createdAt.toLocaleDateString(), 50, yPosition);
        doc.text(transaction.type, 130, yPosition);
        doc.text(`${transaction.amount} ${transaction.currency}`, 190, yPosition);
        doc.text(transaction.status, 270, yPosition);
        doc.text(`NFX-${transaction.id.slice(-8).toUpperCase()}`, 340, yPosition);
        yPosition += rowHeight;
      });

      // Footer
      doc.fontSize(8).text('This is an electronically generated statement.', { align: 'center' });
      doc.text('For any inquiries, contact support@nexafx.com', { align: 'center' });

      doc.end();
    });
  }

  /**
   * Validate month format (YYYY-MM)
   */
  private validateMonthFormat(month: string): boolean {
    const regex = /^\d{4}-(0[1-9]|1[0-2])$/;
    return regex.test(month);
  }

  /**
   * Get transaction by ID with ownership validation
   */
  async getTransactionById(transactionId: string, userId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId, userId },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found or access denied');
    }

    return transaction;
  }

  /**
   * Email transaction receipt to user's registered email
   */
  async emailTransactionReceipt(
    transactionId: string,
    userId: string,
  ): Promise<void> {
    // Generate the PDF receipt
    const pdfBuffer = await this.generateTransactionReceipt(transactionId, userId);
    
    // Get transaction details for email content
    const transaction = await this.getTransactionById(transactionId, userId);
    const user = await this.usersService.findOne(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Send email with PDF attachment
    await this.sendReceiptEmail(user.email, transaction, pdfBuffer);
  }

  /**
   * Send receipt email with PDF attachment using Mailgun
   */
  private async sendReceiptEmail(
    to: string,
    transaction: Transaction,
    pdfBuffer: Buffer,
  ): Promise<void> {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');
    const fromName = this.configService.get<string>('MAILGUN_FROM_NAME') ?? 'NexaFX';

    if (!apiKey || !domain || !fromEmail) {
      throw new Error(
        'Missing Mailgun configuration: MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL are required',
      );
    }

    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');
    if (skipEmail === 'true') {
      this.logger.log(`[RECEIPT DEV] Email skipped — Receipt for ${to}: Transaction ${transaction.id}`);
      return;
    }

    try {
      const mailgun = new Mailgun(FormData);
      const client = mailgun.client({ username: 'api', key: apiKey });

      const referenceNumber = `NFX-${transaction.id.slice(-8).toUpperCase()}`;
      const transactionDate = transaction.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff;">
          <div style="background: #F5A623; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">NexaFX</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin: 0 0 8px; font-size: 20px; color: #1A1A1A;">Your Transaction Receipt</h2>
            <p style="color: #555; line-height: 1.6;">
              Thank you for using NexaFX. Please find your transaction receipt attached to this email.
            </p>
            
            <div style="background: #FFF8E7; border: 2px solid #F5A623; border-radius: 12px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Reference Number</p>
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #1A1A1A;">${referenceNumber}</p>
              
              <p style="margin: 16px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Transaction Type</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1A1A1A;">${transaction.type}</p>
              
              <p style="margin: 16px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Amount</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1A1A1A;">${transaction.amount} ${transaction.currency}</p>
              
              <p style="margin: 16px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Date</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1A1A1A;">${transactionDate}</p>
              
              <p style="margin: 16px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Status</p>
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${transaction.status === 'SUCCESS' ? '#27ae60' : transaction.status === 'FAILED' ? '#e74c3c' : '#f39c12'};">${transaction.status}</p>
            </div>

            ${transaction.txHash ? `
            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #666;">Stellar Transaction Hash</p>
              <p style="margin: 0; font-size: 12px; font-family: monospace; word-break: break-all; color: #1A1A1A;">${transaction.txHash}</p>
              <p style="margin: 8px 0 0; font-size: 12px;">
                <a href="https://stellar.expert/explorer/testnet/tx/${transaction.txHash}" style="color: #F5A623; text-decoration: none;">View on Stellar Explorer →</a>
              </p>
            </div>
            ` : ''}
            
            <p style="font-size: 12px; color: #999; text-align: center; margin-top: 32px;">
              If you have any questions about this transaction, please contact our support team at support@nexafx.com
            </p>
            <p style="font-size: 12px; color: #ccc; text-align: center;">
              © ${new Date().getFullYear()} NexaFX. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const textContent = `
Your Transaction Receipt

Thank you for using NexaFX. Please find your transaction receipt attached to this email.

Transaction Details:
- Reference Number: ${referenceNumber}
- Type: ${transaction.type}
- Amount: ${transaction.amount} ${transaction.currency}
- Date: ${transactionDate}
- Status: ${transaction.status}
${transaction.txHash ? `- Stellar Transaction Hash: ${transaction.txHash}\n- Explorer Link: https://stellar.expert/explorer/testnet/tx/${transaction.txHash}` : ''}

If you have any questions about this transaction, please contact our support team at support@nexafx.com

© ${new Date().getFullYear()} NexaFX. All rights reserved.
      `.trim();

      await client.messages.create(domain, {
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: `Your NexaFX Transaction Receipt - ${referenceNumber}`,
        html: htmlContent,
        text: textContent,
        attachment: {
          filename: `receipt-${transaction.id}.pdf`,
          data: pdfBuffer,
          contentType: 'application/pdf',
        },
      });

      this.logger.log(`[RECEIPT] Receipt email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(
        `[RECEIPT] Failed to send receipt email to ${to}`,
        error instanceof Error ? error.message : String(error),
      );
      throw new Error('Failed to send receipt email');
    }
  }
}
