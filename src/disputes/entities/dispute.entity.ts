import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { DisputeEvidence } from './dispute-evidence.entity';

export enum DisputeReason {
  UNAUTHORIZED = 'UNAUTHORIZED',
  DUPLICATE = 'DUPLICATE',
  GOODS_NOT_RECEIVED = 'GOODS_NOT_RECEIVED',
  INCORRECT_AMOUNT = 'INCORRECT_AMOUNT',
  OTHER = 'OTHER',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED_VALID = 'RESOLVED_VALID',
  RESOLVED_CHARGEBACK = 'RESOLVED_CHARGEBACK',
  CLOSED = 'CLOSED',
}

// Optimizes admin filtering by status
@Index(['status'])
// Optimizes per-user dispute lookups
@Index(['raisedById', 'status'])
@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  transactionId: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column({ type: 'uuid' })
  raisedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raisedById' })
  raisedBy: User;

  @Column({ type: 'enum', enum: DisputeReason })
  reason: DisputeReason;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
  })
  status: DisputeStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedAdminId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedAdminId' })
  assignedAdmin: User | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'timestamp with time zone' })
  disputeWindowExpiry: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null;

  @OneToMany(() => DisputeEvidence, (e) => e.dispute, { cascade: ['insert'] })
  evidence: DisputeEvidence[];
}
