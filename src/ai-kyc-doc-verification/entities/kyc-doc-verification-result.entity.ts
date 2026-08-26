import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, JoinColumn, Index } from 'typeorm';
import { KYCApplication } from '../../kyc/entities/kyc-application.entity';

export enum KycVerificationDecision {
  PASS = 'PASS',
  FAIL = 'FAIL',
  REVIEW = 'REVIEW',
}

@Entity('kyc_doc_verification_results')
export class KycDocVerificationResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index({ unique: true })
  kycApplicationId: string;

  @OneToOne(() => KYCApplication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kycApplicationId' })
  kycApplication: KYCApplication;

  @Column({ type: 'varchar', length: 100 })
  documentType: string;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  confidenceScore: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  faceMatchScore: number;

  @Column({
    type: 'enum',
    enum: KycVerificationDecision,
  })
  decision: KycVerificationDecision;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  extractedFields: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string; // YYYY-MM-DD
    expiryDate?: string;   // YYYY-MM-DD
    documentNumber?: string;
  } | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
