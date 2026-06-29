import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('auto_topup_rules')
export class AutoTopupRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  targetCurrency: string; // The currency being monitored (e.g., "XLM")

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  triggerBalanceThreshold: number;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  topupAmount: number;

  @Column({ type: 'column_definition', default: 'USD' })
  sourceCurrency: string; // The funding wallet (e.g., "NGN")

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 3 })
  maxTopupsPerDay: number;

  @Column({ default: 0 })
  topupCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastTopupAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}