import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('exchange_rate_snapshots')
export class ExchangeRateSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  from: string;

  @Column({ type: 'varchar', length: 10 })
  to: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  rate: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  timestamp: Date;
}
