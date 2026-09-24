import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export interface HoldingSnapshot {
  currency: string;
  amount: number;
  usdValue: number;
  percent: number;
}

@Entity('portfolio_snapshots')
@Index(['userId', 'createdAt'])
export class PortfolioSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  /** Total portfolio value in USD at snapshot time */
  @Column({ type: 'decimal', precision: 24, scale: 8 })
  totalValueUsd: number;

  /** Per-currency holdings at snapshot time */
  @Column({ type: 'jsonb' })
  holdings: HoldingSnapshot[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
