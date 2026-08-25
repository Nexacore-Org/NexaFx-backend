import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum ExpenseStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  organisationId: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amountUsd: string;

  @Column({ type: 'varchar', length: 50 })
  expenseCategory: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  merchant: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  receiptKey: string | null;

  @Column({ type: 'boolean', default: false })
  isBillable: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  clientId: string | null;

  @Column({ type: 'boolean', default: false })
  taxDeductible: boolean;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: ExpenseStatus, default: ExpenseStatus.DRAFT })
  status: ExpenseStatus;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
