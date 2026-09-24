import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique, Index } from 'typeorm';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

@Entity('invoices')
@Unique(['userId', 'invoiceNumber']) // Enforce sequential uniqueness scoped per-user
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  invoiceNumber: string; // e.g., INV-00001

  @Column()
  recipientEmail: string;

  @Column()
  recipientName: string;

  @Column({ type: 'jsonb' })
  lineItems: LineItem[];

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  totalAmount: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercent: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'date' })
  dueDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ nullable: true })
  paymentUrl: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  linkedTransactionId: string;

  @Column({ default: 0 })
  reminderCount: number;

  @Column({ type: 'date', nullable: true })
  lastReminderSentAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}