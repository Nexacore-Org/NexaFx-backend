import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/user.entity';

export enum PaymentRuleTrigger {
  BALANCE_BELOW = 'BALANCE_BELOW',
  BALANCE_ABOVE = 'BALANCE_ABOVE',
}

export enum PaymentRuleAction {
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  SWAP = 'SWAP',
}

@Entity('payment_rules')
export class PaymentRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: PaymentRuleTrigger,
  })
  triggerType: PaymentRuleTrigger;

  @Column({ type: 'jsonb' })
  triggerCondition: {
    currency: string;
    threshold: number;
  };

  @Column({
    type: 'enum',
    enum: PaymentRuleAction,
  })
  actionType: PaymentRuleAction;

  @Column({ type: 'jsonb' })
  actionParameters: {
    // for SWAP:
    fromCurrency?: string;
    toCurrency?: string;
    amount?: number;
    // for SEND_NOTIFICATION:
    message?: string;
  };

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastEvaluatedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastTriggeredAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
