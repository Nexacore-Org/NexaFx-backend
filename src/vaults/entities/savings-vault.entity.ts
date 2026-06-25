import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { VaultTransaction } from './vault-transaction.entity';

export enum SavingsVaultStatus {
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
@Index(['userId'])
@Index(['userId', 'status'])
export class SavingsVault {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  targetAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  currentBalance: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: '0.05' })
  annualInterestRate: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  accruedInterest: string;

  @Column({ type: 'timestamp with time zone' })
  unlockAt: Date;

  @Column({
    type: 'enum',
    enum: SavingsVaultStatus,
    default: SavingsVaultStatus.ACTIVE,
  })
  status: SavingsVaultStatus;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: '0.10' })
  earlyWithdrawalPenaltyPercent: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  autoDepositAmount: string | null;

  @Column({
    type: 'enum',
    enum: AutoDepositFrequency,
    nullable: true,
  })
  autoDepositFrequency: AutoDepositFrequency | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  autoDepositLastRun: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  maturedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  @OneToMany(() => VaultTransaction, (tx) => tx.vault)
  transactions: VaultTransaction[];
}
