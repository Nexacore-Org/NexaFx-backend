import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('revenue_snapshots')
export class RevenueSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  date: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  totalUsd: string;

  @Column({ type: 'jsonb', default: '{}' })
  breakdown: {
    platformFees: string;
    markupRevenue: string;
    merchantCommissions: string;
    loanInterest: string;
    stakingFees: string;
    subscriptionFees: string;
  };

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
