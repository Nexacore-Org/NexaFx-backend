import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

export enum ComponentStatus {
  OPERATIONAL = 'OPERATIONAL',
  DEGRADED = 'DEGRADED',
  PARTIAL_OUTAGE = 'PARTIAL_OUTAGE',
  MAJOR_OUTAGE = 'MAJOR_OUTAGE',
}

@Entity('status_components')
export class StatusComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'varchar', length: 100 })
  name: string;
  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;
  @Column({ type: 'enum', enum: ComponentStatus, default: ComponentStatus.OPERATIONAL })
  status: ComponentStatus;
  @Column({ type: 'numeric', precision: 5, scale: 2, default: '100.00' })
  uptimePercent90d: string;
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
