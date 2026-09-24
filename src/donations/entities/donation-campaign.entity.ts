import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Charity } from './charity.entity';

export enum CampaignStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('donation_campaigns')
@Index(['status'])
export class DonationCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  charityId: string;

  @ManyToOne(() => Charity, (c) => c.campaigns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'charityId' })
  charity: Charity;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  targetAmount: string | null;

  @Column({ type: 'varchar', length: 10, default: 'XLM' })
  currency: string;

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true })
  endDate: Date | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  raisedAmount: string;

  @Column({ type: 'int', default: 0 })
  donorCount: number;

  @Column({ type: 'enum', enum: CampaignStatus, default: CampaignStatus.ACTIVE })
  status: CampaignStatus;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
