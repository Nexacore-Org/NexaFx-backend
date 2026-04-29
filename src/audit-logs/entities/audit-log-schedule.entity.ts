import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ScheduleFrequency {
  MONTHLY = 'MONTHLY',
}

@Entity({ name: 'audit_log_schedules' })
export class AuditLogSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  adminUserId: string;

  @Column({ type: 'varchar', length: 255 })
  adminEmail: string;

  @Column({ type: 'enum', enum: ScheduleFrequency, default: ScheduleFrequency.MONTHLY })
  frequency: ScheduleFrequency;

  @Column({ type: 'timestamptz', nullable: true })
  lastRun: Date | null;

  @Column({ type: 'timestamptz' })
  nextRun: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
