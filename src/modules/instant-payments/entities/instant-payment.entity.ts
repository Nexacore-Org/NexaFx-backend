import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum InstantPaymentStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('instant_payments')
export class InstantPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', length: 20 })
  recipientBankCode: string;

  @Column({ type: 'varchar', length: 20 })
  recipientAccountNumber: string;

  @Column({ type: 'varchar', length: 100 })
  recipientAccountName: string;

  @Column({ type: 'varchar', length: 100 })
  narration: string;

  @Column({
    type: 'enum',
    enum: InstantPaymentStatus,
    default: InstantPaymentStatus.INITIATED,
  })
  status: InstantPaymentStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerReference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerStatus: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
