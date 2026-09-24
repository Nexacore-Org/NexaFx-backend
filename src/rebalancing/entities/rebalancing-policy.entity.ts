import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RebalanceFrequency {
  MANUAL = 'MANUAL',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export interface TargetAllocation {
  currency: string;
  targetPercent: number; // e.g., 60 for 60%
}

@Entity('rebalancing_policies')
export class RebalancingPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  @Index()
  userId: string;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  @Column({ type: 'jsonb' })
  allocations: TargetAllocation[];

  @Column({ type: 'int', default: 5 })
  driftThresholdPercent: number;

  @Column({
    type: 'enum',
    enum: RebalanceFrequency,
    default: RebalanceFrequency.MANUAL,
  })
  frequency: RebalanceFrequency;

  @Column({ type: 'timestamp', nullable: true })
  lastRebalancedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}