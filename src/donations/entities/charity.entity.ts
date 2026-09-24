import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DonationCampaign } from './donation-campaign.entity';

@Entity('charities')
export class Charity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoKey: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  websiteUrl: string | null;

  @Column({ type: 'varchar', length: 56 })
  stellarWalletAddress: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  registrationNumber: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  totalReceived: string;

  @Column({ type: 'int', default: 0 })
  donorCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => DonationCampaign, (c) => c.charity)
  campaigns: DonationCampaign[];
}
