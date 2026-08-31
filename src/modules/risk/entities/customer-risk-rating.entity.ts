import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface RiskFactors {
  kycTierScore?: number;
  transactionVelocityScore?: number;
  flaggedActivityScore?: number;
  countryRiskScore?: number;
  disputeHistoryScore?: number;
  rawFactors?: Record<string, any>;
}

@Entity('customer_risk_ratings')
export class CustomerRiskRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index({ unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: '0.00' })
  score: number;

  @Column({
    type: 'enum',
    enum: RiskLevel,
    default: RiskLevel.LOW,
  })
  riskLevel: RiskLevel;

  @Column({ type: 'jsonb', default: {} })
  factors: RiskFactors;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastEvaluatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
