import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum KycStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  RESUBMISSION_REQUIRED = 'resubmission_required',
}

export enum KycTier {
  TIER_0 = 0,
  TIER_1 = 1,
  TIER_2 = 2,
}

export enum DocumentType {
  PASSPORT = 'passport',
  NATIONAL_ID = 'national_id',
  DRIVERS_LICENSE = 'drivers_license',
}

@Entity('kyc_records')
export class KycRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Proper relation
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.PENDING,
  })
  status: KycStatus;

  @Column({
    type: 'int',
    default: KycTier.TIER_0,
  })
  tier: KycTier;

  @Column()
  fullName: string;

  @Column({ type: 'date' })
  dateOfBirth: Date;

  @Column()
  nationality: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
  })
  documentType: DocumentType;

  @Column()
  documentNumber: string;

  /** Storage key returned by StorageService.upload() — never a URL or local path */
  @Column({ name: 'documentFrontKey' })
  documentFrontKey: string;

  /** Storage key for the back of the document (optional) */
  @Column({ name: 'documentBackKey', nullable: true })
  documentBackKey: string;

  /** Storage key for the selfie image */
  @Column({ name: 'selfieKey' })
  selfieKey: string;

  @Column({ nullable: true })
  rejectionReason: string;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedBy' })
  reviewer: User | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  submittedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
