import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { VaultStatus } from '../enum/vault-status.enum';
import { AutoDepositFrequency } from '../enum/auto-deposit-frequency.enum';
import { VaultTransaction } from './vault-transaction.entity';

@Index(['userId', 'status'])
@Index(['status', 'unlockAt'])
@Entity('savings_vaults')
export class SavingsVault {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 10 })
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
    enum: VaultStatus,
    default: VaultStatus.ACTIVE,
  })
  status: VaultStatus;

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
  lastInterestAccruedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  maturedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => VaultTransaction, (tx) => tx.vault)
  transactions: VaultTransaction[];
}
