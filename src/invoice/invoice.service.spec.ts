/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * Unit tests for InvoiceService.
 *
 * Known integration gap (flagged per issue instructions):
 *   executePayment contains a TODO comment — the balance-transfer call is
 *   stubbed with a mock transaction ID. Tests assert the current stub
 *   behaviour explicitly so a future real implementation forces a test update.
 *
 * EmailService and UserService are imported from paths that do not exist in
 * the upstream v2 tree. Shim files at those paths were added alongside this
 * spec so the module resolves without modifying the service under test.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { Invoice, InvoiceStatus, LineItem } from './entities/invoice.entity';
import { EmailService } from '../auth/email.service';
import { UserService } from '../user/user.service';

// ---------------------------------------------------------------------------
// Repository mock factory
// ---------------------------------------------------------------------------

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

// ---------------------------------------------------------------------------
// Dependency mocks
// ---------------------------------------------------------------------------

const mockEmailService = { sendMail: jest.fn() };
const mockUserService = { findById: jest.fn() };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const INVOICE_ID = 'invoice-uuid-1';

const LINE_ITEMS: LineItem[] = [
  { description: 'Consulting', quantity: 2, unitPrice: 100, amount: 200 },
  { description: 'Hosting', quantity: 1, unitPrice: 50, amount: 50 },
];

const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
  ({
    id: INVOICE_ID,
    userId: USER_ID,
    invoiceNumber: 'INV-00001',
    recipientEmail: 'client@example.com',
    recipientName: 'Client Name',
    lineItems: LINE_ITEMS,
    subtotal: 250,
    taxPercent: 10,
    taxAmount: 25,
    totalAmount: 275,
    currency: 'USD',
    notes: null,
    dueDate: new Date('2024-12-31'),
    status: InvoiceStatus.DRAFT,
    paymentUrl: null,
    paidAt: null,
    linkedTransactionId: null,
    reminderCount: 0,
    lastReminderSentAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as unknown as Invoice);

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('InvoiceService', () => {
  let service: InvoiceService;
  let invoiceRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(Invoice), useFactory: makeRepo },
        { provide: EmailService, useValue: mockEmailService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
    invoiceRepo = module.get(getRepositoryToken(Invoice));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // createInvoice
  // -------------------------------------------------------------------------
  describe('createInvoice', () => {
    it('assigns INV-00001 when no prior invoice exists for the user', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      let captured: Record<string, unknown> = {};
      invoiceRepo.create.mockImplementation((p: Record<string, unknown>) => {
        captured = p;
        return p;
      });
      invoiceRepo.save.mockImplementation(async (inv) => inv);

      await service.createInvoice(USER_ID, { lineItems: LINE_ITEMS, taxPercent: 10 });

      expect(captured.invoiceNumber).toBe('INV-00001');
      expect(captured.status).toBe(InvoiceStatus.DRAFT);
    });

    it('increments the sequence number from the last invoice', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ invoiceNumber: 'INV-00005' }));
      let captured: Record<string, unknown> = {};
      invoiceRepo.create.mockImplementation((p: Record<string, unknown>) => {
        captured = p;
        return p;
      });
      invoiceRepo.save.mockImplementation(async (inv) => inv);

      await service.createInvoice(USER_ID, { lineItems: LINE_ITEMS, taxPercent: 0 });

      expect(captured.invoiceNumber).toBe('INV-00006');
    });

    it('computes subtotal, taxAmount, and totalAmount correctly from line items', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      let captured: Record<string, unknown> = {};
      invoiceRepo.create.mockImplementation((p: Record<string, unknown>) => {
        captured = p;
        return p;
      });
      invoiceRepo.save.mockImplementation(async (inv) => inv);

      // LINE_ITEMS: (2*100)+(1*50)=250 subtotal, 10% tax=25, total=275
      await service.createInvoice(USER_ID, { lineItems: LINE_ITEMS, taxPercent: 10 });

      expect(captured.subtotal).toBe(250);
      expect(captured.taxAmount).toBe(25);
      expect(captured.totalAmount).toBe(275);
    });

    it('forces status to DRAFT regardless of what the dto contains', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      let captured: Record<string, unknown> = {};
      invoiceRepo.create.mockImplementation((p: Record<string, unknown>) => {
        captured = p;
        return p;
      });
      invoiceRepo.save.mockImplementation(async (inv) => inv);

      await service.createInvoice(USER_ID, {
        lineItems: LINE_ITEMS,
        status: InvoiceStatus.PAID, // attacker attempt to override
      });

      expect(captured.status).toBe(InvoiceStatus.DRAFT);
    });

    it('attaches the userId from the service argument, not from dto', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      let captured: Record<string, unknown> = {};
      invoiceRepo.create.mockImplementation((p: Record<string, unknown>) => {
        captured = p;
        return p;
      });
      invoiceRepo.save.mockImplementation(async (inv) => inv);

      await service.createInvoice(USER_ID, { lineItems: LINE_ITEMS, userId: 'attacker-id' });

      expect(captured.userId).toBe(USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // updateInvoice
  // -------------------------------------------------------------------------
  describe('updateInvoice', () => {
    it('applies dto fields to a DRAFT invoice and saves', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice());
      const updated = buildInvoice({ notes: 'Updated' });
      invoiceRepo.save.mockResolvedValue(updated);

      const result = await service.updateInvoice(INVOICE_ID, USER_ID, { notes: 'Updated' });

      expect(invoiceRepo.findOne).toHaveBeenCalledWith({
        where: { id: INVOICE_ID, userId: USER_ID },
      });
      expect(result.notes).toBe('Updated');
    });

    it('throws NotFoundException when invoice is not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.updateInvoice(INVOICE_ID, USER_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a SENT invoice (immutability lock)', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ status: InvoiceStatus.SENT }));
      await expect(service.updateInvoice(INVOICE_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a PAID invoice (immutability lock)', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ status: InvoiceStatus.PAID }));
      await expect(service.updateInvoice(INVOICE_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an OVERDUE invoice (immutability lock)', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ status: InvoiceStatus.OVERDUE }));
      await expect(service.updateInvoice(INVOICE_ID, USER_ID, {})).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // sendInvoice
  // -------------------------------------------------------------------------
  describe('sendInvoice', () => {
    it('transitions status to SENT, sets paymentUrl, and sends email to recipient', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice());
      invoiceRepo.save.mockImplementation(async (inv) => inv);
      mockEmailService.sendMail.mockResolvedValue(undefined);

      const result = await service.sendInvoice(INVOICE_ID, USER_ID);

      expect(result.status).toBe(InvoiceStatus.SENT);
      expect(result.paymentUrl).toMatch(/\/v2\/invoices\/.+\/pay$/);
      expect(mockEmailService.sendMail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendMail).toHaveBeenCalledWith(
        'client@example.com',
        expect.stringContaining('INV-00001'),
        expect.any(String),
      );
    });

    it('throws NotFoundException when invoice is not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.sendInvoice(INVOICE_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('incorporates FRONTEND_URL env var into the payment link', async () => {
      process.env.FRONTEND_URL = 'https://app.nexafx.com';
      invoiceRepo.findOne.mockResolvedValue(buildInvoice());
      invoiceRepo.save.mockImplementation(async (inv) => inv);
      mockEmailService.sendMail.mockResolvedValue(undefined);

      const result = await service.sendInvoice(INVOICE_ID, USER_ID);

      expect(result.paymentUrl).toContain('https://app.nexafx.com');
      delete process.env.FRONTEND_URL;
    });
  });

  // -------------------------------------------------------------------------
  // executePayment
  // -------------------------------------------------------------------------
  describe('executePayment', () => {
    it('marks invoice PAID, records paidAt and stub transactionId, sends receipts to both parties', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ status: InvoiceStatus.SENT }));
      invoiceRepo.save.mockImplementation(async (inv) => inv);
      mockEmailService.sendMail.mockResolvedValue(undefined);
      mockUserService.findById.mockResolvedValue({ email: 'owner@nexafx.com' });

      const result = await service.executePayment(INVOICE_ID, 'payer-uuid');

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(result.paidAt).toBeInstanceOf(Date);
      expect(result.linkedTransactionId).toMatch(/^TXN-INV-\d+$/);
      expect(mockEmailService.sendMail).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.executePayment(INVOICE_ID, 'payer')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invoice is already PAID', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ status: InvoiceStatus.PAID }));
      await expect(service.executePayment(INVOICE_ID, 'payer')).rejects.toThrow(BadRequestException);
    });

    /**
     * Known integration gap (flagged in issue and in source TODO):
     * executePayment generates a stub transaction ID (`TXN-INV-<timestamp>`)
     * instead of calling a real balance/escrow engine. This test documents
     * the stub behaviour — any future real implementation must update this test.
     */
    it('integration gap: linkedTransactionId is a stub not a real payment engine result', async () => {
      invoiceRepo.findOne.mockResolvedValue(buildInvoice({ status: InvoiceStatus.SENT }));
      invoiceRepo.save.mockImplementation(async (inv) => inv);
      mockEmailService.sendMail.mockResolvedValue(undefined);
      mockUserService.findById.mockResolvedValue(null); // owner not found — owner email skipped

      const result = await service.executePayment(INVOICE_ID, 'payer');

      expect(result.linkedTransactionId).toMatch(/^TXN-INV-\d+$/);
      // Only one email sent (recipient receipt); owner lookup returned null
      expect(mockEmailService.sendMail).toHaveBeenCalledTimes(1);
    });
  });
});
