import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { User } from '../../../users/user.entity';

@Entity('cold_storage_accounts')
@Unique(['userId', 'currency'])
export class ColdStorageAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'varchar', length: 10 })
  currency: string;
  @Column({ type: 'varchar', length: 64 })
  stellarPublicKey: string;
  @Column({ type: 'numeric', precision: 20, scale: 8, default: '0.00000000' })
  balance: string;
  @Column({ type: 'numeric', precision: 20, scale: 8, default: '0.00000000' })
  pendingWithdrawals: string;
  @Column({ type: 'boolean', default: false })
  isVerified: boolean;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
