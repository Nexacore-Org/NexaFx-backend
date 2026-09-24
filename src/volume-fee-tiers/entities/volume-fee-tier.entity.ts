import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('volume_fee_tiers')
export class VolumeFeeTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Bronze / Silver / Gold / Platinum (#697).
  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  minVolume30dUsd: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  sendFeePercent: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  exchangeFeePercent: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  maxSendFee: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
