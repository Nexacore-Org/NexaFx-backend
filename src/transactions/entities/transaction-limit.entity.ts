import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserKycTier } from '../../users/user.entity';

@Entity('transaction_limits')
@Index(['tier', 'transactionType', 'currency'], { unique: true })
export class TransactionLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: UserKycTier,
  })
  tier: UserKycTier;

  @Column({ type: 'varchar', length: 50 })
  transactionType: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  singleTransactionMax: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  dailyMax: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  monthlyMax: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
