
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

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

@Entity({ name: 'report_export_jobs' })
export class ReportExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: ExportJobStatus,
    default: ExportJobStatus.PENDING,
  })
  @Index()
  status: ExportJobStatus;

  @Column({
    type: 'enum',
    enum: ExportFormat,
  })
  format: ExportFormat;

  @Column({ type: 'timestamptz' })
  fromDate: Date;

  @Column({ type: 'timestamptz' })
  toDate: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename: string | null;

  @Column({ name: 'file_url', length: 500, nullable: true })
  fileUrl: string | null;

  @Column({ name: 's3_url', type: 'varchar', length: 512, nullable: true })
  s3Url: string | null;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'record_count', type: 'int', default: 0 })
  recordCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
