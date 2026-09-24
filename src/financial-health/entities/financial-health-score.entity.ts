import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum HealthGrade {
  POOR = 'POOR',
  FAIR = 'FAIR',
  GOOD = 'GOOD',
  EXCELLENT = 'EXCELLENT'
}

@Entity('financial_health_scores')
export class FinancialHealthScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'integer' })
  score: number;

  @Column({ type: 'enum', enum: HealthGrade })
  grade: HealthGrade;

  @Column({ type: 'jsonb' })
  breakdown: {
    savingsRateScore: number;
    spendingConsistencyScore: number;
    loanRepaymentScore: number;
    diversificationScore: number;
    transactionFrequencyScore: number;
    kycTierScore: number;
    accountAgeScore: number;
  };

  @Column({ type: 'text', array: true })
  tips: string[];

  @Column({ type: 'integer', default: 0 })
  previousScore: number;

  @Column({ type: 'integer', default: 0 })
  scoreDelta: number;

  @CreateDateColumn({ type: 'timestamptz' })
  calculatedAt: Date;
}