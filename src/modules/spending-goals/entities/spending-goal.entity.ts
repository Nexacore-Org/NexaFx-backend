import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum GoalPeriod {
  MONTHLY = 'MONTHLY',
}

@Entity('spending_goals')
export class SpendingGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  targetAmount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'enum', enum: GoalPeriod, default: GoalPeriod.MONTHLY })
  period: GoalPeriod;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
