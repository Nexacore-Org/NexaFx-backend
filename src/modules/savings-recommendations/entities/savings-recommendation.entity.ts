import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum RecommendationType {
  VAULT_CONTRIBUTION = 'VAULT_CONTRIBUTION',
  RECURRING_SETUP = 'RECURRING_SETUP',
  VAULT_DURATION = 'VAULT_DURATION',
  TOPUP_REDUCTION = 'TOPUP_REDUCTION',
}

@Entity('savings_recommendations')
export class SavingsRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  userId: string;
  @Column({ type: 'enum', enum: RecommendationType })
  type: RecommendationType;
  @Column({ type: 'varchar', length: 200 })
  title: string;
  @Column({ type: 'text' })
  body: string;
  @Column({ type: 'numeric', precision: 20, scale: 8, nullable: true })
  potentialSavingsXlm: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  actionDeepLink: string | null;
  @Column({ type: 'boolean', default: false })
  isActedOn: boolean;
  @Column({ type: 'timestamp with time zone' })
  generatedAt: Date;
  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
