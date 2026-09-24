import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MicroSavingsRule } from './micro-savings-rule.entity';

@Entity('micro_savings_contributions')
export class MicroSavingsContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => MicroSavingsRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ruleId' })
  rule: MicroSavingsRule;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  vaultId: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 30 })
  triggerType: string;

  @Column({ type: 'uuid', nullable: true })
  sourceTransactionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourceSpendingGoalId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
