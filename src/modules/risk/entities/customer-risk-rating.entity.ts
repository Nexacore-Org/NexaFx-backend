import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RiskRating {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH',
}

@Entity('customer_risk_ratings')
export class CustomerRiskRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'enum', enum: RiskRating, default: RiskRating.LOW })
  rating: RiskRating;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'jsonb', default: '{}' })
  factors: any;

  @Column({ type: 'timestamp with time zone' })
  lastAssessedAt: Date;

  @Column({ type: 'timestamp with time zone' })
  nextAssessmentDue: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
