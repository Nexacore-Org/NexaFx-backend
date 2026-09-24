
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('balance_snapshots')
@Index(['userId', 'snapshotDate'])
export class BalanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'jsonb' })
  balances: Record<string, number>;

  @Column({ name: 'snapshot_date', type: 'date' })
  @Index()
  snapshotDate: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
