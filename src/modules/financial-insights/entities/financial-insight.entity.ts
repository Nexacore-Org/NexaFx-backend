import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export interface InsightItem {
  title: string;
  body: string;
  type: string;
  deepLink?: string;
}

@Entity('financial_insights')
@Index(['userId', 'weekOf'], { unique: true })
export class FinancialInsight {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  weekOf: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  insights: InsightItem[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  insightTypes: string[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  generatedAt: Date;
}
