import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { LoanApplication } from './loan-application.entity';

export enum RepaymentStatus {
  SCHEDULED = 'SCHEDULED',
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  OVERDUE = 'OVERDUE',
  WAIVED = 'WAIVED',
}

@Index(['loanId', 'status'])
@Entity('loan_repayments')
export class LoanRepayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @ManyToOne(() => LoanApplication, (l) => l.repayments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: LoanApplication;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  principalAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  interestAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0.00000000' })
  penaltyAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  totalDue: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0.00000000' })
  paidAmount: string;

  @Column({ type: 'enum', enum: RepaymentStatus, default: RepaymentStatus.SCHEDULED })
  status: RepaymentStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  paidAt: Date | null;
}
