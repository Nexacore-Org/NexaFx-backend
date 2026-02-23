import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import PDFDocument from 'pdfkit';
import { Response } from 'express';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly usersService: UsersService,
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
}
