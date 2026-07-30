import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';

export enum MicroSavingsTriggerType {
  PER_TRANSACTION = 'PER_TRANSACTION',
  BALANCE_THRESHOLD = 'BALANCE_THRESHOLD',
  SPENDING_GOAL_HIT = 'SPENDING_GOAL_HIT',
}

@Entity('micro_savings_rules')
@Index(['userId', 'isActive'])
export class MicroSavingsRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  targetVaultId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: MicroSavingsTriggerType })
  triggerType: MicroSavingsTriggerType;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  saveAmount: string;

  @Column({ type: 'jsonb', nullable: true })
  perTransactionConfig: { minTransactionAmount?: number; savePercent?: number } | null;

  @Column({ type: 'jsonb', nullable: true })
  balanceThresholdConfig: { thresholdAmount?: number; saveExcess?: boolean } | null;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  maxDailyContribution: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
