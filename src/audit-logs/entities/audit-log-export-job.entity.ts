import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ExportJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ExportFormat {
  PDF = 'PDF',
  CSV = 'CSV',
}

@Entity({ name: 'audit_log_export_jobs' })
export class AuditLogExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  adminUserId: string;

  @Column({ type: 'enum', enum: ExportJobStatus, default: ExportJobStatus.PENDING })
  @Index()
  status: ExportJobStatus;

  @Column({ type: 'enum', enum: ExportFormat })
  format: ExportFormat;

  // store filters as JSON for reference
  @Column({ type: 'jsonb' })
  filters: Record<string, any>;

  // filename after generation
  @Column({ type: 'varchar', length: 255, nullable: true })
  filename: string | null;

  // size in bytes after generation
  @Column({ type: 'bigint', nullable: true })
  fileSize: number | null;

  // error message if failed
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  // number of records included
  @Column({ type: 'int', default: 0 })
  recordCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
