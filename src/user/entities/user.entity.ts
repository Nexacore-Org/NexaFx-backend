import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Token } from '../../auth/entities/token.entity';
import { Notifications } from 'src/notifications/entities/notification.entity';
import { RateLock } from 'src/transactions/entities/ratelock.entity';

export enum UserRole {
  USER = 'User',
  ADMIN = 'Admin',
  AUDITOR = 'Auditor',
}

export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @Column({ unique: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  profilePicture: string;

  @Column({ nullable: true })
  bio: string;

  @OneToMany(() => Notifications, (notification) => notification.user)
  notification: Notifications;

  @Column({ default: false })
  isVerified: boolean;

  @Index('idx_users_verification_status')
  @Column({
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.UNVERIFIED,
  })
  verificationStatus: VerificationStatus;

  @Column({ type: 'timestamp', nullable: true })
  verificationRequestedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  verificationCompletedAt: Date;

  @Column({ type: 'text', nullable: true })
  verificationRejectionReason: string;

  @Column({ type: 'int', default: 0 })
  profileCompletionPercentage: number;

  @Column({ type: 'boolean', default: false })
  requiredFieldsCompleted: boolean;

  @Index('idx_users_phone_verified')
  @Column({ type: 'boolean', default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  phoneVerificationCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  phoneVerificationCodeExpiry: Date | null;

  @Column({ type: 'int', default: 0 })
  phoneVerificationAttempts: number;

  @Column({ type: 'json', nullable: true })
  verificationDocuments: {
    idDocument?: { url: string; uploadedAt: string; status?: string };
    proofOfAddress?: { url: string; uploadedAt: string; status?: string };
  } | null;

  @Column({ nullable: true })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpires: Date;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ nullable: true })
  lastLogin: Date;

  @OneToMany(() => Token, (token) => token.user, { cascade: true })
  tokens: Token[];

  @OneToMany(() => RateLock, (rateLock) => rateLock.user, { cascade: true })
  rateLocks: RateLock[];

  @Column({ nullable: true })
  walletAddress: string;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  balance: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
