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
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Optimizes scheduled-job scans of pending transactions ordered by creation time.
@Index(['status', 'createdAt'])
// Optimizes user transaction list filtering by status.
@Index(['userId', 'status'])
@Index(['externalReference'])
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
    type: DB_COLUMN_TYPES.enum,
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
    type: DB_COLUMN_TYPES.enum,
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  txHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  bankAccountId?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  rail: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalReference: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  reservedBalanceAmount: string | null;

  @Column({ type: DB_COLUMN_TYPES.json, nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  feeAmount: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  feeCurrency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
