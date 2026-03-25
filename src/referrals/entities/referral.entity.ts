import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

export enum ReferralStatus {
  PENDING = 'pending',
  REWARDED = 'rewarded',
}

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  referrerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  @Column({ type: 'uuid', unique: true })
  @Index()
  refereeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refereeId' })
  referee: User;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  rewardAmount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  rewardCurrency: string | null;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  rewardedAt: Date | null;

  @CreateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  createdAt: Date;

  @UpdateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  updatedAt: Date;
}
