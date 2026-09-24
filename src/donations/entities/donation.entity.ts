import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DonationCampaign } from './donation-campaign.entity';

@Entity('donations')
@Index(['campaignId'])
@Index(['userId'])
export class Donation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => DonationCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: DonationCampaign;

  // null when anonymous
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'boolean', default: false })
  anonymous: boolean;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  referenceNumber: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
