import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('currency_pairs')
@Index(['fromCurrencyCode', 'toCurrencyCode'], { unique: true })
export class CurrencyPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  fromCurrencyCode: string;

  @Column({ type: 'varchar', length: 10 })
  toCurrencyCode: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  spreadPercent: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  minAmountUsd: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  maxAmountUsd: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  suspendedUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  suspensionReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
