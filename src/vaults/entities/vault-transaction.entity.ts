import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SavingsVault } from './savings-vault.entity';

export enum VaultTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  INTEREST = 'INTEREST',
  PENALTY = 'PENALTY',
}

@Entity('vault_transactions')
@Index(['vaultId'])
@Index(['vaultId', 'createdAt'])
export class VaultTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  vaultId: string;

  @ManyToOne(() => SavingsVault, (vault) => vault.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vaultId' })
  vault: SavingsVault;

  @Column({
    type: 'enum',
    enum: VaultTransactionType,
  })
  type: VaultTransactionType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balanceBefore: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balanceAfter: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
