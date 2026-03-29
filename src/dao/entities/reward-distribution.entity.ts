import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RewardDistributionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('reward_distributions')
export class RewardDistribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  @Index()
  contractId: string;

  @Column({ type: 'varchar', length: 128 })
  functionName: string;

  @Column({ type: 'jsonb', nullable: true })
  args: any[] | null;

  @Column({ type: 'decimal', precision: 30, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  currency: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  txHash: string | null;

  @Column({
    type: 'enum',
    enum: RewardDistributionStatus,
    default: RewardDistributionStatus.PENDING,
  })
  @Index()
  status: RewardDistributionStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
