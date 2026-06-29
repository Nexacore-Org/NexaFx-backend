import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('auto_topup_events')
export class AutoTopupEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  ruleId: string;

  @Column()
  status: 'SUCCESS' | 'FAILED_INSUFFICIENT_FUNDS' | 'VELOCITY_LIMIT_BREACHED';

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  executedAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}