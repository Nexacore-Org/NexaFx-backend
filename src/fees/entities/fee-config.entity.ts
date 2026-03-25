import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

export enum FeeTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  CONVERT = 'CONVERT',
}

export enum FeeType {
  FLAT = 'FLAT',
  PERCENTAGE = 'PERCENTAGE',
}

@Entity('fee_configs')
export class FeeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: FeeTransactionType,
  })
  transactionType: FeeTransactionType;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: FeeType,
  })
  feeType: FeeType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  feeValue: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  minFee: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  maxFee: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
