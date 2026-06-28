import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { VaultTransactionType } from '../enum/vault-transaction-type.enum';
import { SavingsVault } from './savings-vault.entity';

@Index(['vaultId', 'createdAt'])
@Entity('vault_transactions')
export class VaultTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
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

  @Column({ nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
