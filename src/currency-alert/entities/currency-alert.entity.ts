// src/currency-alerts/entities/currency-alert.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { AlertDirection } from '../dto/alert-direction.enum';

@Entity()
export class CurrencyAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.currencyAlerts)
  user: User;

  @Column()
  baseCurrency: string;

  @Column()
  targetCurrency: string;

  @Column('decimal', { precision: 10, scale: 4 })
  thresholdRate: number;

  @Column({ type: 'enum', enum: AlertDirection })
  direction: AlertDirection;

  @Column({ type: 'timestamp', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
