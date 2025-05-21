import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { CurrencyType } from '../enum/currencyType.enum';

@Entity()
@Unique(['code']) // Ensures the currency code is unique
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column({ type: 'int' })
  decimalPlaces: number;

  @Column({ type: 'enum', enum: CurrencyType })
  type: CurrencyType;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  rate?: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUpdated?: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ nullable: true })
  logoUrl?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
