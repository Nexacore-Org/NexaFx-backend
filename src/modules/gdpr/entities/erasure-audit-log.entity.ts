import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('erasure_audit_logs')
export class ErasureAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  erasedAt: Date;

  @Column({ type: 'int', default: 0 })
  filesDeleted: number;

  @Column({ type: 'simple-array', nullable: true })
  failedDeletions: string[];
}
