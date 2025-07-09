import { Currency } from 'src/currencies/entities/currency.entity';
import { TransactionType } from 'src/transactions/enums/transaction-type.enum';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

@Entity('fee_rules')
export class FeeRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TransactionType })
  @Index()
  transactionType: TransactionType;

  @ManyToOne(() => Currency, { eager: true })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  @Column({ type: 'uuid' })
  currencyId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  minTransactionAmount?: number; // volume threshold (optional)

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxTransactionAmount?: number; // volume cap (optional)

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  feePercentage: number; // e.g., 1.50 means 1.5%

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercentage?: number; // optional discount (for promos)

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  isActive: boolean; // enable/disable rule

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
