import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';

export enum ConversionQuoteStatus {
  PENDING = 'PENDING',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
}

@Entity('conversion_quotes')
@Index(['userId'])
@Index(['status'])
@Index(['expiresAt'])
export class ConversionQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 10 })
  fromCurrency: string;

  @Column({ type: 'varchar', length: 10 })
  toCurrency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  fromAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  toAmount: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  rate: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  fee: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  feePercent: string;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  usedAt: Date | null;

  @Column({
    type: 'enum',
    enum: ConversionQuoteStatus,
    default: ConversionQuoteStatus.PENDING,
  })
  status: ConversionQuoteStatus;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
