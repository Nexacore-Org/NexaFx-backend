import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

export enum RateAlertCondition {
  ABOVE = 'above',
  BELOW = 'below',
}

@Entity('rate_alerts')
export class RateAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  fromCurrency: string;

  @Column({ type: 'varchar', length: 10 })
  @Index()
  toCurrency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  targetRate: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: RateAlertCondition,
  })
  condition: RateAlertCondition;

  @Column({ type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  recurring: boolean;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  triggeredAt: Date | null;

  @CreateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  createdAt: Date;
}
