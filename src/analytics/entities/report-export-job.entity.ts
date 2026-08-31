
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

@Entity('report_export_jobs')
}

@Entity({ name: 'report_export_jobs' })
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
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'enum', enum: ExportJobStatus, default: ExportJobStatus.PENDING })
  @Index()
  status: ExportJobStatus;

  @Column({ type: 'enum', enum: ExportFormat })
  format: ExportFormat;

  @Column({ type: 'timestamptz' })
  fromDate: Date;

  @Column({ type: 'timestamptz' })
  toDate: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  s3Url: string | null;

  @Column({ type: 'bigint', nullable: true })
  fileSize: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  recordCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
