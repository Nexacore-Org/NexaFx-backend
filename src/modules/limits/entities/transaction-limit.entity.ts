import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserKycTier } from '../../../users/user.entity';

@Entity('transaction_limits')
export class TransactionLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: UserKycTier,
    default: UserKycTier.UNVERIFIED,
  })
  kycTier: UserKycTier;

  @Column({ type: 'varchar', length: 50, nullable: true })
  transactionType?: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  singleTransactionMax: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  dailyMax: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  monthlyMax: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  // Aliases for compatibility
  get tier(): UserKycTier {
    return this.kycTier;
  }
  set tier(val: UserKycTier) {
    this.kycTier = val;
  }

  get singleTxLimitUsd(): string {
    return this.singleTransactionMax;
  }
  set singleTxLimitUsd(val: string) {
    this.singleTransactionMax = val;
  }

  get dailyLimitUsd(): string {
    return this.dailyMax;
  }
  set dailyLimitUsd(val: string) {
    this.dailyMax = val;
  }

  get monthlyLimitUsd(): string {
    return this.monthlyMax;
  }
  set monthlyLimitUsd(val: string) {
    this.monthlyMax = val;
  }
}
