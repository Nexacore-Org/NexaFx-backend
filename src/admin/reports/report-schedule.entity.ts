import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ReportFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum ReportType {
  REVENUE = 'REVENUE',
  COHORT = 'COHORT',
  FUNNEL = 'FUNNEL',
  TOP_USERS = 'TOP_USERS',
}

@Entity('report_schedules')
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ReportType })
  reportType: ReportType;

  @Column({ type: 'enum', enum: ReportFrequency })
  frequency: ReportFrequency;

  @Column({ type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ type: 'text', nullable: true })
  parameters: string; // JSON string of parameters for the report

  @Column({ type: 'timestamp', nullable: true })
  nextRunAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
