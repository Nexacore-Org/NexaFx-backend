import {
  Entity,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';

export enum LedgerAccountType {
  USER = 'USER',
  PLATFORM_ASSET = 'PLATFORM_ASSET',
  PLATFORM_LIABILITY = 'PLATFORM_LIABILITY',
  FEE_REVENUE = 'FEE_REVENUE',
}

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Index(['transactionId'])
@Index(['currency', 'direction'])
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column({
    type: 'enum',
    enum: LedgerAccountType,
  })
  accountType: LedgerAccountType;

  @Column({
    type: 'enum',
    enum: LedgerDirection,
  })
  direction: LedgerDirection;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}