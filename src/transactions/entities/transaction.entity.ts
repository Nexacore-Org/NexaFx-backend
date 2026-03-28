import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  SWAP = 'SWAP',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Optimizes scheduled-job scans of pending transactions ordered by creation time.
@Index(['status', 'createdAt'])
// Optimizes user transaction list filtering by status.
@Index(['userId', 'status'])
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  rate: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  txHash: string;

  @Column({ type: 'text', nullable: true })
  failureReason: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  feeAmount: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  feeCurrency: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  toCurrency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  toAmount: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processingLockedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  processingLockedBy: string | null;
}
