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

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'jsonb' })
  balances: Record<string, number>;

  @Column({ type: 'date' })
  @Index()
  snapshotDate: string;

  @CreateDateColumn()
  createdAt: Date;
}
