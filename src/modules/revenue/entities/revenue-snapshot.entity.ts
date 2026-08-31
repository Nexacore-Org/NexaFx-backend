import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RevenuePeriodType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

@Entity('revenue_snapshots')
@Index(['periodType', 'periodStart', 'periodEnd'], { unique: true })
export class RevenueSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: RevenuePeriodType,
  })
  periodType: RevenuePeriodType;

  @Column({ type: 'timestamp with time zone' })
  periodStart: Date;

  @Column({ type: 'timestamp with time zone' })
  periodEnd: Date;

  @Column({ type: 'int', default: 0 })
  totalTransactions: number;

  @Column({ type: 'decimal', precision: 24, scale: 8, default: '0.00000000' })
  totalVolumeUsd: string;

  @Column({ type: 'decimal', precision: 24, scale: 8, default: '0.00000000' })
  totalFeeRevenueUsd: string;

  @Column({ type: 'jsonb', default: {} })
  feeBreakdown: Record<string, string>;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'boolean', default: false })
  isFinalized: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
