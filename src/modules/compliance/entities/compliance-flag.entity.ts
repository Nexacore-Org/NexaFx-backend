import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { Transaction } from '../../../transactions/entities/transaction.entity';

export enum ComplianceFlagStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  CLEARED = 'CLEARED',
  SAR_FILED = 'SAR_FILED',
}

@Index(['userId', 'status'])
@Index(['rule', 'createdAt'])
@Entity('compliance_flags')
export class ComplianceFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  transactionId?: string;

  @ManyToOne(() => Transaction, (tx) => tx.id, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  transaction?: Transaction;

  @Column()
  rule: string;

  @Column({ type: 'int' })
  riskScore: number;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @Column({ type: 'varchar', length: 30, default: ComplianceFlagStatus.OPEN })
  status: ComplianceFlagStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
