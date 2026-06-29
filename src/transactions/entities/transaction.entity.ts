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
import { TransactionCategory } from '../../analytics/entities/transaction-category.entity';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  SWAP = 'SWAP',
  LOAN_DISBURSEMENT = 'LOAN_DISBURSEMENT',
  LOAN_REPAYMENT = 'LOAN_REPAYMENT',
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
// Optimizes counterpartyMemo ILIKE search.
@Index(['counterpartyMemo'])
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
  txHash: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  counterpartyMemo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;
  stellarTxHash: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  feeAmount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  feeCurrency: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  toCurrency: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  toAmount: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processingLockedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  processingLockedBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => TransactionCategory, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'categoryId' })
  category: TransactionCategory | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  /**
   * Private note written by the transaction owner.
   * NEVER returned in counterparty-facing responses.
   */
  @Column({ type: 'text', nullable: true })
  userNote: string | null;

  /**
   * Shared memo visible to both parties. Also written to the Stellar
   * transaction memo field (truncated to 28 bytes if needed).
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  counterpartyMemo: string | null;

  /**
   * User-defined tags for grouping and filtering.
   * Stored as a PostgreSQL text array. GIN-indexed for efficient array queries.
   */
  @Column({ type: 'text', array: true, nullable: true, default: null })
  tags: string[] | null;

  @Column({ type: 'tsvector', nullable: true })
  searchVector: string | null;
}
