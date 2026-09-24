import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum BulkActionStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('bulk_actions')
export class BulkAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  adminId: string;

  // e.g. bulk_kyc_approve, bulk_user_suspend (#708).
  @Column({ type: 'varchar', length: 60 })
  actionType: string;

  @Column({ type: 'jsonb', default: [] })
  targetIds: string[];

  @Column({
    type: 'enum',
    enum: BulkActionStatus,
    default: BulkActionStatus.PENDING_CONFIRMATION,
  })
  status: BulkActionStatus;

  @Column({ type: 'int', default: 0 })
  affectedCount: number;

  @Column({ type: 'jsonb', nullable: true })
  resultSummary: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
