import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ExportJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ExportFormat {
  CSV = 'CSV',
  PDF = 'PDF',
  XLSX = 'XLSX',
}

@Entity('report_export_jobs')
export class ReportExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ExportJobStatus,
    default: ExportJobStatus.PENDING,
  })
  status: ExportJobStatus;

  @Column({
    type: 'enum',
    enum: ExportFormat,
  })
  format: ExportFormat;

  @Column({ name: 'file_url', length: 500, nullable: true })
  fileUrl: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
