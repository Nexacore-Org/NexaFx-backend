import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { LoanRepayment } from './loan-repayment.entity';

export enum LoanStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE',
  REPAID = 'REPAID',
  DEFAULTED = 'DEFAULTED',
}

@Index(['userId', 'status'])
@Entity('loan_applications')
export class LoanApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  requestedAmount: string;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  currency: string;

  @Column({ type: 'int' })
  termDays: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  interestRatePercent: string;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.PENDING })
  status: LoanStatus;

  @Column({ type: 'int', default: 0 })
  creditScore: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  approvedAmount: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  disbursedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  dueDate: Date | null;

  @OneToMany(() => LoanRepayment, (r) => r.loan, { cascade: true })
  repayments: LoanRepayment[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
