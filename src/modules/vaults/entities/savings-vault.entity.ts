import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { VaultTransaction } from './vault-transaction.entity';

export enum VaultStatus {
  ACTIVE = 'ACTIVE',
  MATURED = 'MATURED',
  CLOSED = 'CLOSED',
  BROKEN = 'BROKEN',
}

export enum AutoDepositFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

@Entity('savings_vaults')
@Index(['userId', 'status'])
export class SavingsVault {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  targetAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  currentBalance: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.05 })
  annualInterestRate: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  accruedInterest: string;

  @Column({ type: 'timestamp with time zone' })
  unlockAt: Date;

  @Column({
    type: 'enum',
    enum: VaultStatus,
    default: VaultStatus.ACTIVE,
  })
  status: VaultStatus;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.10 })
  earlyWithdrawalPenaltyPercent: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  autoDepositAmount: string | null;

  @Column({
    type: 'enum',
    enum: AutoDepositFrequency,
    nullable: true,
  })
  autoDepositFrequency: AutoDepositFrequency | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  maturedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  @OneToMany(() => VaultTransaction, (tx) => tx.vault)
  transactions: VaultTransaction[];
}
