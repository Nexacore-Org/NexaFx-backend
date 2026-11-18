import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

export enum TaxEventType {
  ACQUISITION = 'ACQUISITION',
  DISPOSAL = 'DISPOSAL',
}

@Index(['userId', 'taxYear'])
@Index(['userId', 'currency'])
@Entity('tax_events')
export class TaxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column({
    type: 'enum',
    enum: TaxEventType,
  })
  eventType: TaxEventType;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  quantity: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  priceUsdAtEvent: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  costBasisUsd: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  proceedsUsd: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  gainLossUsd: string | null;

  @Column({ type: 'integer', nullable: true })
  holdingPeriodDays: number | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  acquiredAt: Date | null;

  @Column({ type: 'integer' })
  taxYear: number;

  @CreateDateColumn()
  createdAt: Date;
}
