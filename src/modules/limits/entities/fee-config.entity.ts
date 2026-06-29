import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FeeTransactionType {
  SEND = 'SEND',
  EXCHANGE = 'EXCHANGE',
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  SWAP = 'SWAP',
  CONVERT = 'CONVERT',
}

export enum FeeType {
  PERCENT = 'PERCENT',
  FLAT = 'FLAT',
  PERCENTAGE = 'PERCENTAGE',
}

@Entity('fee_configs')
export class FeeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  transactionType: string;

  @Column({ type: 'varchar', length: 20, default: 'PERCENT' })
  feeType: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: '0' })
  feeValue: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  minFee: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  maxFee: string | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
