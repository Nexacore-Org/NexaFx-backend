import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ConditionalPaymentStatus {
  PENDING = 'PENDING',
  TRIGGERED = 'TRIGGERED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum ConditionType {
  SCHEDULED_DATE = 'SCHEDULED_DATE',
  RATE_THRESHOLD = 'RATE_THRESHOLD',
  RECIPIENT_KYC_TIER = 'RECIPIENT_KYC_TIER',
}

@Entity('conditional_payments')
@Index(['userId', 'status'])
export class ConditionalPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ConditionType,
  })
  conditionType: ConditionType;

  @Column({ type: 'jsonb' })
  conditionParams: Record<string, any>;

  @Column({ type: 'jsonb' })
  actionParams: Record<string, any>;

  @Column({
    type: 'enum',
    enum: ConditionalPaymentStatus,
    default: ConditionalPaymentStatus.PENDING,
  })
  status: ConditionalPaymentStatus;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}