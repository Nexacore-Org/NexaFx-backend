import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ActivityFeedType {
  TRANSACTION_COMPLETE = 'TRANSACTION_COMPLETE',
  KYC_DECISION = 'KYC_DECISION',
  REFERRAL_REWARD = 'REFERRAL_REWARD',
  RATE_ALERT_TRIGGER = 'RATE_ALERT_TRIGGER',
  NEW_DEVICE_LOGIN = 'NEW_DEVICE_LOGIN',
}

@Entity('activity_feed_items')
export class ActivityFeedItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: ActivityFeedType,
  })
  @Index()
  type: ActivityFeedType;

  @Column({ type: 'varchar', nullable: true })
  referenceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  referenceType: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  @Index()
  createdAt: Date;
}
