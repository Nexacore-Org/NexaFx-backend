import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('balance_snapshots')
@Index(['userId', 'snapshotDate'])
export class BalanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balance: string;

  @Column({ length: 10 })
  currency: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
