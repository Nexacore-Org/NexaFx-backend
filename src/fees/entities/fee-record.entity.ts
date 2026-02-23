import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { FeeType } from './fee-config.entity';

@Entity('fee_records')
export class FeeRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  feeAmount: string;

  @Column({ type: 'varchar', length: 10 })
  feeCurrency: string;

  @Column({
    type: 'enum',
    enum: FeeType,
  })
  feeType: FeeType;

  @CreateDateColumn()
  createdAt: Date;
}
