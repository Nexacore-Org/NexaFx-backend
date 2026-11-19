import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { UserPlan } from './user.entity';

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
export const RATE_LIMIT_CONFIG_CACHE_TTL_MS = 5 * 60_000;

@Entity('rate_limit_configs')
@Unique(['plan'])
export class RateLimitConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: UserPlan,
    unique: true,
  })
  plan: UserPlan;

  @Column({ type: 'int', nullable: true })
  limitPerMinute: number | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
