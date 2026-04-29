import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('report_jobs')
export class ReportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  jobId: string; // For external tracking or client reference

  @Column({ type: 'enum', enum: JobStatus })
  status: JobStatus;

  @Column({ type: 'text', nullable: true })
  parameters: string; // JSON string of parameters for the report

  @Column({ type: 'text', nullable: true })
  result: string; // Could be a URL or path to the generated report (CSV, etc.)

  @Column({ type: 'text', nullable: true })
  error: string; // Error message if job failed

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
