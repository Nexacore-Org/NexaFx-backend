import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ColdStorageAccount } from './cold-storage-account.entity';

export enum ColdStorageWithdrawalStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  WAITING_PERIOD = 'WAITING_PERIOD',
  READY_TO_CONFIRM = 'READY_TO_CONFIRM',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

@Entity('cold_storage_withdrawals')
export class ColdStorageWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  coldStorageAccountId: string;
  @ManyToOne(() => ColdStorageAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coldStorageAccountId' })
  coldStorageAccount: ColdStorageAccount;
  @Column({ type: 'uuid' })
  userId: string;
  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amount: string;
  @Column({ type: 'enum', enum: ColdStorageWithdrawalStatus, default: ColdStorageWithdrawalStatus.PENDING_APPROVAL })
  status: ColdStorageWithdrawalStatus;
  @Column({ type: 'varchar', length: 255, nullable: true })
  adminId: string | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  readyAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;
  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
