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
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

export enum KycStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
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

  // 🔥 Proper relation
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
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
    type: DB_COLUMN_TYPES.enum,
    enum: DocumentType,
  })
  documentType: DocumentType;

  @Column()
  documentNumber: string;

  @Column()
  documentFrontUrl: string;

  @Column({ nullable: true })
  documentBackUrl: string;

  @Column()
  selfieUrl: string;

  @Column({ nullable: true })
  rejectionReason: string;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  reviewedAt: Date;

  @Column({ type: DB_COLUMN_TYPES.timestamp, default: () => 'CURRENT_TIMESTAMP' })
  submittedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
