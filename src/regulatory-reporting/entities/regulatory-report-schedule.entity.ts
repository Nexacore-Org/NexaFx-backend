import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReportType {
  LARGE_TX_SUMMARY = 'LARGE_TX_SUMMARY',
  SUSPICIOUS_ACTIVITY_SUMMARY = 'SUSPICIOUS_ACTIVITY_SUMMARY',
}

export enum ReportFrequency {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

@Entity('regulatory_report_schedules')
export class RegulatoryReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ReportType,
  })
  reportType: ReportType;

  @Column({
    type: 'enum',
    enum: ReportFrequency,
  })
  frequency: ReportFrequency;

  @Column()
  recipientEmail: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('regulatory_report_history')
export class RegulatoryReportHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  reportType: string;

  @Column('text')
  reportData: string; // JSON snapshot of the aggregate summary

  @Column()
  downloadUrl: string;

  @CreateDateColumn()
  generatedAt: Date;
}