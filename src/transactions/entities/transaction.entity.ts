import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column()
  asset: string;

  @Column({ type: 'enum', enum: TransactionType })
  @Index()
  type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'uuid' })
  currencyId: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  @Index()
  status: TransactionStatus;

  @Column({ nullable: true })
  txHash: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ unique: true })
  reference: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  sourceAccount?: string;

  @Column({ nullable: true })
  destinationAccount?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalAmount?: number; 

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  feeAmount?: number;

  @Column({ type: 'uuid', nullable: true })
  feeCurrencyId?: string;

  @Column({ type: 'timestamp', nullable: true })
  processingDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completionDate?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
