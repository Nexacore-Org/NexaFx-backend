import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('balance_alerts')
export class BalanceAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  walletId: string;

  @Column({ type: 'varchar', length: 20 })
  assetCode: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  thresholdAmount: number;

  @Column({ type: 'varchar', length: 10 })
  triggerType: 'BELOW' | 'ABOVE';

  @Column({ type: 'varchar', length: 10 })
  notificationMethod: 'EMAIL' | 'SMS' | 'PUSH';

  @Column({ type: 'bigint', default: 0 })
  lastTriggeredAt: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
