import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { User } from '../../users/user.entity';

export enum ReversalStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('transaction_reversals')
export class TransactionReversal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index({ unique: true })
  transactionId: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column({ type: 'uuid', nullable: true })
  reversalTransactionId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid' })
  authorisedBy: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorisedBy' })
  authorisedByUser: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  legalReference: string | null;

  @Column({ type: 'enum', enum: ReversalStatus, default: ReversalStatus.PENDING_CONFIRMATION })
  status: ReversalStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
