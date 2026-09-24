import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum BankProvider { MONO = 'MONO', OKRA = 'OKRA' }

@Entity('linked_bank_accounts')
export class LinkedBankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  userId: string;
  @Column({ type: 'enum', enum: BankProvider })
  provider: BankProvider;
  @Column({ type: 'varchar', length: 255 })
  accountId: string;
  @Column({ type: 'varchar', length: 200 })
  bankName: string;
  @Column({ type: 'varchar', length: 200 })
  accountName: string;
  @Column({ type: 'varchar', length: 4 })
  accountNumber: string;
  @Column({ type: 'varchar', length: 10, default: 'NGN' })
  currency: string;
  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSyncedAt: Date | null;
  @Column({ type: 'boolean', default: true })
  isActive: boolean;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
