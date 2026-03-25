import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DB_COLUMN_TYPES } from '../../../common/database/column-types';

export enum BankAccountStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  FAILED = 'FAILED',
}

@Index(['userId', 'status'])
@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 120 })
  bankName: string;

  @Column({ type: 'varchar', length: 120 })
  accountHolderName: string;

  @Column({ type: 'text' })
  accountNumberEncrypted: string;

  @Column({ type: 'varchar', length: 4 })
  accountNumberLast4: string;

  @Column({ type: 'varchar', length: 32 })
  routingNumber: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: BankAccountStatus,
    default: BankAccountStatus.PENDING_VERIFICATION,
  })
  status: BankAccountStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  microDeposit1: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  microDeposit2: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  verificationReference: string | null;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
